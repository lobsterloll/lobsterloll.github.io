using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace LobsterCalc;

public static class LicenseVerifier
{
    private static byte[] Decode(string value)
    {
        var normalized = value.Replace('-', '+').Replace('_', '/');
        return Convert.FromBase64String(normalized.PadRight((normalized.Length + 3) / 4 * 4, '='));
    }

    public static bool IsValid(string? token, string deviceId, string publicKey)
    {
        try
        {
            if (string.IsNullOrEmpty(token) || token.Length > 16000) return false;
            var parts = token.Split('.');
            if (parts.Length != 2) return false;
            using var rsa = RSA.Create();
            rsa.ImportFromPem(publicKey);
            if (!rsa.VerifyData(Encoding.ASCII.GetBytes(parts[0]), Decode(parts[1]), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1)) return false;
            using var payload = JsonDocument.Parse(Decode(parts[0]));
            var p = payload.RootElement;
            return p.GetProperty("v").GetInt32() == 2
                && p.GetProperty("product").GetString() == "lobsterloll-calculator"
                && p.GetProperty("deviceId").GetString() == deviceId
                && p.GetProperty("mode").GetString() == "live"
                && p.GetProperty("paymentMethod").GetString() == "interac"
                && p.GetProperty("recipientEmail").GetString() == "junhapark2010@gmail.com"
                && p.GetProperty("currency").GetString() == "CAD"
                && p.GetProperty("amount").GetString() == "3.00"
                && !string.IsNullOrWhiteSpace(p.GetProperty("transactionId").GetString());
        }
        catch (Exception error) when (error is CryptographicException or FormatException or JsonException or KeyNotFoundException or InvalidOperationException or ArgumentException)
        {
            return false;
        }
    }
}
