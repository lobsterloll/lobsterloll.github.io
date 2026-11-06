import {generateKeyPairSync,createPublicKey} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const privateFile = path.join(directory, 'private', 'license-private.pem');
fs.mkdirSync(path.dirname(privateFile), {recursive:true});
if (!fs.existsSync(privateFile)) {
  const keys = generateKeyPairSync('rsa', {
    modulusLength:3072,
    publicKeyEncoding:{type:'spki',format:'pem'},
    privateKeyEncoding:{type:'pkcs8',format:'pem'},
  });
  fs.writeFileSync(privateFile, keys.privateKey, {mode:0o600});
}
const publicKey = createPublicKey(fs.readFileSync(privateFile)).export({type:'spki',format:'pem'});
fs.writeFileSync(path.join(directory,'../app/LicensePublicKey.pem'),publicKey);
console.log('License signing key is stored privately. Public verification key prepared for the Windows app.');
