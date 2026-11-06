using System.Globalization;

namespace LobsterCalc;

public sealed class ExpressionParser
{
    private readonly string text;
    private int position;
    private int depth;

    private ExpressionParser(string expression)
    {
        text = expression.Replace('×', '*').Replace('÷', '/').Replace('−', '-');
    }

    public static double Evaluate(string expression)
    {
        if (string.IsNullOrWhiteSpace(expression)) throw new FormatException("Type a calculation first.");
        if (expression.Length > 256) throw new FormatException("That calculation is too long.");
        var parser = new ExpressionParser(expression);
        var result = parser.Sum();
        parser.SkipSpaces();
        if (parser.position != parser.text.Length) throw new FormatException("Check your numbers and operators.");
        if (!double.IsFinite(result)) throw new ArithmeticException("The result is too large or undefined.");
        return result;
    }

    private void SkipSpaces()
    {
        while (position < text.Length && char.IsWhiteSpace(text[position])) position++;
    }

    private bool Take(char value)
    {
        SkipSpaces();
        if (position >= text.Length || text[position] != value) return false;
        position++;
        return true;
    }

    private double Sum()
    {
        var result = Product();
        while (true)
        {
            if (Take('+')) result += Product();
            else if (Take('-')) result -= Product();
            else return result;
        }
    }

    private double Product()
    {
        var result = Unary();
        while (true)
        {
            if (Take('*')) result *= Unary();
            else if (Take('/'))
            {
                var divisor = Unary();
                if (divisor == 0) throw new ArithmeticException("You can’t divide by zero.");
                result /= divisor;
            }
            else return result;
        }
    }

    private double Unary()
    {
        if (Take('+')) return Unary();
        if (Take('-')) return -Unary();
        var result = Primary();
        while (Take('%')) result /= 100;
        if (Take('^')) result = Math.Pow(result, Unary());
        return result;
    }

    private double Primary()
    {
        if (Take('('))
        {
            if (++depth > 32) throw new FormatException("Too many nested brackets.");
            var result = Sum();
            if (!Take(')')) throw new FormatException("A closing bracket is missing.");
            depth--;
            return result;
        }
        SkipSpaces();
        var start = position;
        while (position < text.Length && (char.IsAsciiDigit(text[position]) || text[position] == '.')) position++;
        if (position < text.Length && (text[position] == 'e' || text[position] == 'E'))
        {
            position++;
            if (position < text.Length && (text[position] == '+' || text[position] == '-')) position++;
            while (position < text.Length && char.IsAsciiDigit(text[position])) position++;
        }
        if (start == position || !double.TryParse(text[start..position], NumberStyles.Float, CultureInfo.InvariantCulture, out var number))
            throw new FormatException("Check your numbers and operators.");
        if (!double.IsFinite(number)) throw new ArithmeticException("That number is too large.");
        return number;
    }
}
