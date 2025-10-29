import { RelayPool } from "applesauce-relay";
import {
  NostrConnectSigner,
  PrivateKeySigner,
  type ISigner,
} from "applesauce-signers";

// Create relay pool
export const pool = new RelayPool({ keepAlive: 0 });

// Function to create a signer from a string (nsec key or bunker URI)
export async function createSigner(signerString: string): Promise<ISigner> {
  let signer: ISigner;

  if (signerString.startsWith("nsec")) {
    signer = PrivateKeySigner.fromKey(signerString);
  } else if (signerString.startsWith("ncryptsec")) {
    throw new Error("Ncryptsec signers are not supported");
  } else if (signerString.startsWith("bunker://")) {
    NostrConnectSigner.subscriptionMethod = pool.subscription.bind(pool);
    NostrConnectSigner.publishMethod = pool.publish.bind(pool);
    signer = await NostrConnectSigner.fromBunkerURI(signerString);
  } else {
    throw new Error(
      `Invalid signer provided: ${signerString.substring(0, 10)}... Must start with 'nsec' or 'bunker://'`,
    );
  }

  // Validate the signer by getting the public key
  await signer.getPublicKey();

  return signer;
}
