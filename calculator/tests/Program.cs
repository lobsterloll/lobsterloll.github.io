using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using LobsterCalc;

var assertions = 0;
void Check(bool condition, string name)
{
    assertions++;
    if (!condition) throw new Exception("Failed: " + name);
}
void Number(string expression, double expected) => Check(Math.Abs(ExpressionParser.Evaluate(expression)-expected)<0.00000001,expression);
foreach (var pair in new (string,double)[] {("2+3*4",14),("(2+3)*4",20),("−2^2",-4),("2^-2",0.25),("2^3^2",512),("50%",0.5),(".1+.2",0.3),("1e3+2",1002),("9÷3×2",6)}) Number(pair.Item1,pair.Item2);
foreach (var invalid in new[]{"1/0","System.IO.File.Delete(1)","2+","2..3","(2+3","1e309",new string('(',40)+"1"+new string(')',40)})
{
    var rejected=false;
    try {ExpressionParser.Evaluate(invalid);} catch(Exception error) when(error is FormatException or ArithmeticException){rejected=true;}
    Check(rejected,"reject "+invalid);
}
using var rsa=RSA.Create(2048);
var publicKey=rsa.ExportSubjectPublicKeyInfoPem();
var device=new string('a',64);
string Encode(byte[] bytes)=>Convert.ToBase64String(bytes).TrimEnd('=').Replace('+','-').Replace('/','_');
string Token(string target,string mode="live",string amount="3.00",string currency="CAD",string method="interac",string recipient="junhapark2010@gmail.com",int version=2)
{
    var payload=Encode(JsonSerializer.SerializeToUtf8Bytes(new{v=version,product="lobsterloll-calculator",deviceId=target,mode,amount,currency,paymentMethod=method,recipientEmail=recipient,transactionId="PAID123"}));
    return payload+"."+Encode(rsa.SignData(Encoding.ASCII.GetBytes(payload),HashAlgorithmName.SHA256,RSASignaturePadding.Pkcs1));
}
Check(LicenseVerifier.IsValid(Token(device),device,publicKey),"valid signed paid license");
Check(!LicenseVerifier.IsValid(Token(new string('b',64)),device,publicKey),"other computer cannot unlock");
Check(!LicenseVerifier.IsValid(Token(device,"sandbox"),device,publicKey),"sandbox payments cannot unlock production EXE");
Check(!LicenseVerifier.IsValid(Token(device,amount:"0.00"),device,publicKey),"wrong paid amount");
Check(!LicenseVerifier.IsValid(Token(device,currency:"USD"),device,publicKey),"wrong currency");
Check(!LicenseVerifier.IsValid(Token(device,method:"paypal"),device,publicKey),"PayPal cannot unlock e-transfer build");
Check(!LicenseVerifier.IsValid(Token(device,recipient:"another@example.com"),device,publicKey),"wrong recipient");
Check(!LicenseVerifier.IsValid(Token(device,version:1),device,publicKey),"legacy license cannot unlock e-transfer build");
Check(!LicenseVerifier.IsValid(Token(device)+"X",device,publicKey),"altered signature");
Check(!LicenseVerifier.IsValid("paid=true",device,publicKey),"local paid flag cannot unlock");
Check(!LicenseVerifier.IsValid(null,device,publicKey),"null license");
Console.WriteLine($"Passed {assertions} calculator and license checks.");
