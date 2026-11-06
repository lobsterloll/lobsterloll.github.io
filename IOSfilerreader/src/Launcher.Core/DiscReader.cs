using System.Buffers.Binary;
using System.Text;

namespace XboxLauncher;

public enum ConsoleKind { Unknown, OriginalXbox, Xbox360, XboxOne, XboxSeries }
public record DiscFile(string Path, long Offset, long Size, bool IsDirectory);
public record Inspection(ConsoleKind Console, string Format, string Status, long PartitionOffset, IReadOnlyList<DiscFile> Files)
{
    public bool CanLaunch => Console is ConsoleKind.OriginalXbox or ConsoleKind.Xbox360;
}

public static class DiscReader
{
    private static readonly long[] Partitions = [0, 0xFB20, 0x20600, 0x2080000, 0xFD90000];
    private static readonly byte[] Magic = Encoding.ASCII.GetBytes("MICROSOFT*XBOX*MEDIA");

    public static Inspection Inspect(string path, CancellationToken cancellation = default)
    {
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        foreach (var partition in Partitions)
        {
            cancellation.ThrowIfCancellationRequested();
            long descriptor = partition + 32 * 2048;
            if (descriptor + 2048 > stream.Length) continue;
            var header = Read(stream, descriptor, 2048);
            if (!header.AsSpan(0, 20).SequenceEqual(Magic)) continue;
            if (!header.AsSpan(2028, 20).SequenceEqual(Magic))
                throw new InvalidDataException("The XDVDFS volume descriptor is incomplete or damaged.");
            var files = ReadDirectories(stream, partition, U32(header, 20), U32(header, 24), cancellation);
            // Both generations use XDVDFS. Require the root boot executable's signature.
            var boot = files.FirstOrDefault(f => !f.IsDirectory && f.Path.Equals("default.xex", StringComparison.OrdinalIgnoreCase));
            if (boot is { Size: >= 4 } && Read(stream, boot.Offset, 4).AsSpan().SequenceEqual("XEX2"u8))
                return new(ConsoleKind.Xbox360, "Xbox 360 XDVDFS", "Ready for Xenia; title compatibility varies.", partition, files);
            boot = files.FirstOrDefault(f => !f.IsDirectory && f.Path.Equals("default.xbe", StringComparison.OrdinalIgnoreCase));
            if (boot is { Size: >= 4 } && Read(stream, boot.Offset, 4).AsSpan().SequenceEqual("XBEH"u8))
            {
                if (partition == 0)
                    return new(ConsoleKind.OriginalXbox, "Original Xbox XISO", "Ready for xemu; configure firmware in xemu first.", partition, files);
                return new(ConsoleKind.Unknown, "Original Xbox full-disc image", "Inspection only. xemu requires a prepared XISO image.", partition, files);
            }
            return new(ConsoleKind.Unknown, "XDVDFS", "Inspection only: no recognized root boot executable.", partition, files);
        }
        if (stream.Length >= 32774 && Encoding.ASCII.GetString(Read(stream, 32769, 5)) == "CD001")
            return new(ConsoleKind.Unknown, "ISO 9660", "Unsupported standard ISO. No accessible Xbox game partition was found.", 0, []);
        return new(ConsoleKind.Unknown, "Unknown", "Unsupported or unrecognized image. Xbox One / Series images cannot be launched. Generation cannot be inferred reliably from a filename.", 0, []);
    }

    private static List<DiscFile> ReadDirectories(FileStream stream, long partition, uint rootSector, uint rootSize, CancellationToken cancellation)
    {
        var result = new List<DiscFile>();
        var directories = new Stack<(uint Sector, uint Size, string Path, int Depth)>();
        var seenDirectories = new HashSet<long>();
        long totalDirectoryBytes = 0;
        directories.Push((rootSector, rootSize, "", 0));
        while (directories.TryPop(out var directory))
        {
            cancellation.ThrowIfCancellationRequested();
            if (directory.Size == 0) continue;
            long start = partition + (long)directory.Sector * 2048;
            totalDirectoryBytes += directory.Size;
            if (directory.Depth > 64 || directory.Size > 32 * 1024 * 1024 || totalDirectoryBytes > 128 * 1024 * 1024 || !seenDirectories.Add(start))
                throw new InvalidDataException("Cyclic or oversized directory tree.");
            var data = Read(stream, start, checked((int)directory.Size));
            var nodes = new Stack<int>();
            var seenNodes = new HashSet<int>();
            nodes.Push(0);
            while (nodes.TryPop(out int offset))
            {
                cancellation.ThrowIfCancellationRequested();
                if (!seenNodes.Add(offset) || offset < 0 || offset > data.Length - 14)
                    throw new InvalidDataException("Invalid directory node pointer.");
                ushort left = U16(data, offset);
                ushort right = U16(data, offset + 2);
                uint sector = U32(data, offset + 4);
                uint size = U32(data, offset + 8);
                bool isDirectory = (data[offset + 12] & 0x10) != 0;
                int nameLength = data[offset + 13];
                if (nameLength == 0 || nameLength > data.Length - offset - 14)
                    throw new InvalidDataException("Invalid directory entry name.");
                string name = Encoding.Latin1.GetString(data, offset + 14, nameLength);
                if (name is "." or ".." || name.IndexOfAny(['/', '\\', '\0']) >= 0)
                    throw new InvalidDataException("Invalid filename in image.");
                string path = directory.Path + name;
                long fileOffset = partition + (long)sector * 2048;
                CheckRange(stream, fileOffset, size);
                result.Add(new(path, fileOffset, size, isDirectory));
                if (result.Count > 100000) throw new InvalidDataException("Image exceeds the 100,000 entry inspection limit.");
                if (isDirectory) directories.Push((sector, size, path + "/", directory.Depth + 1));
                if (right != 0) nodes.Push(right * 4);
                if (left != 0) nodes.Push(left * 4);
            }
        }
        return result.OrderBy(f => f.Path, StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static ushort U16(byte[] data, int offset) => BinaryPrimitives.ReadUInt16LittleEndian(data.AsSpan(offset));
    private static uint U32(byte[] data, int offset) => BinaryPrimitives.ReadUInt32LittleEndian(data.AsSpan(offset));
    private static void CheckRange(FileStream stream, long offset, long size)
    {
        if (offset < 0 || offset > stream.Length || size > stream.Length - offset)
            throw new InvalidDataException("An image entry points beyond the end of the file.");
    }
    private static byte[] Read(FileStream stream, long offset, int count)
    {
        CheckRange(stream, offset, count);
        var bytes = new byte[count];
        stream.Position = offset;
        stream.ReadExactly(bytes);
        return bytes;
    }
}
