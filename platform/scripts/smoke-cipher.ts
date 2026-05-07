import { provisionTenantDek, encryptWithDek, decryptWithDek } from "@kavachiq/storage";

const VAULT_URL = "https://kv-kavachiq-platform-dev.vault.azure.net";
const TENANT_ID = "d3a825b6-2465-4666-92be-3a6765fd458b";
const TEST_SECRET = "Abc123~test-client-secret-value";

async function main() {
  console.log("1. Provisioning DEK in Key Vault...");
  const dekUri = await provisionTenantDek(VAULT_URL, TENANT_ID);
  console.log(`   DEK URI: ${dekUri}`);

  console.log("2. Encrypting client secret...");
  const ciphertext = await encryptWithDek(TEST_SECRET, dekUri);
  console.log(`   Ciphertext length: ${ciphertext.length} bytes`);

  console.log("3. Decrypting...");
  const plaintext = await decryptWithDek(ciphertext, dekUri);
  console.log(`   Plaintext: ${plaintext}`);

  if (plaintext !== TEST_SECRET) throw new Error("ROUND-TRIP FAILED");
  console.log("✓ Round-trip OK");
}

main().catch(e => { console.error(e); process.exit(1); });
