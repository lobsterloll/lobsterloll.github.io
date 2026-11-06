using Microsoft.Data.Sqlite;

namespace XboxLauncher;

public record Game(string Path, string Title, ConsoleKind Console, string Format, string Status);

public sealed class Library
{
    private readonly string connectionString;
    public Library(string databasePath)
    {
        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(System.IO.Path.GetFullPath(databasePath))!);
        connectionString = new SqliteConnectionStringBuilder { DataSource = databasePath }.ToString();
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS games(path TEXT PRIMARY KEY COLLATE NOCASE, title TEXT NOT NULL, console INTEGER NOT NULL, format TEXT NOT NULL, status TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS settings(name TEXT PRIMARY KEY, value TEXT NOT NULL);
            """;
        command.ExecuteNonQuery();
    }
    private SqliteConnection Open()
    {
        var connection = new SqliteConnection(connectionString);
        connection.Open();
        return connection;
    }
    public List<Game> Load()
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT path,title,console,format,status FROM games ORDER BY title";
        using var reader = command.ExecuteReader();
        var games = new List<Game>();
        while (reader.Read()) games.Add(new(reader.GetString(0), reader.GetString(1), (ConsoleKind)reader.GetInt32(2), reader.GetString(3), reader.GetString(4)));
        return games;
    }
    public void Save(Game game)
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = "INSERT INTO games VALUES($p,$t,$c,$f,$s) ON CONFLICT(path) DO UPDATE SET console=$c,format=$f,status=$s";
        command.Parameters.AddWithValue("$p", System.IO.Path.GetFullPath(game.Path));
        command.Parameters.AddWithValue("$t", game.Title);
        command.Parameters.AddWithValue("$c", (int)game.Console);
        command.Parameters.AddWithValue("$f", game.Format);
        command.Parameters.AddWithValue("$s", game.Status);
        command.ExecuteNonQuery();
    }
    public void Remove(string path)
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM games WHERE path=$p";
        command.Parameters.AddWithValue("$p", path);
        command.ExecuteNonQuery();
    }
    public string GetSetting(string name)
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT value FROM settings WHERE name=$n";
        command.Parameters.AddWithValue("$n", name);
        return command.ExecuteScalar() as string ?? "";
    }
    public void SetSetting(string name, string value)
    {
        using var connection = Open();
        using var command = connection.CreateCommand();
        command.CommandText = "INSERT INTO settings VALUES($n,$v) ON CONFLICT(name) DO UPDATE SET value=$v";
        command.Parameters.AddWithValue("$n", name);
        command.Parameters.AddWithValue("$v", value);
        command.ExecuteNonQuery();
    }
}
