This is a downloadable reusable UI template that utilizes Next.js and Tailwind for the front end framework while also being preinstalled with Metaplex Umi, Solana WalletAdapter, and Zustand global store for ease of use.

This template includes a complete NFT minting experience with modern UI components, wallet integration, and comprehensive features for Solana-based NFT projects.

![WebUI Preview](/metaplex-next-js-template.png)

## Features

### Core Framework
- Next.js 14 React framework with App Router
- Tailwind CSS for styling
- TypeScript for type safety
- Solana WalletAdapter integration
- Metaplex Umi for blockchain interactions
- Zustand for global state management

### UI Components & Sections
- **Modern Landing Page**: Clean, minimal design with responsive layout
- **Hero Section**: Eye-catching banner with call-to-action buttons
- **About Section**: Feature showcase with icons and descriptions
- **Story Section**: Timeline-based narrative with media support
- **Mint Section**: Complete minting interface with progress tracking
- **Team Section**: Team member showcase with social links
- **Gallery Pages**: NFT collection display with filtering
- **Navigation**: Responsive navigation with mobile menu

### Wallet & Blockchain Features
- **Wallet Integration**: Multi-wallet support with connection status
- **SOL Balance Display**: Real-time balance in navigation bar
- **NFT Minting**: Complete minting flow with progress tracking
- **Cancel Functionality**: Safe cancellation during minting process
- **Rarity System**: Built-in rarity calculation and display
- **Public RPC**: Uses Solana's public RPC endpoints

### User Experience
- **Dark/Light Mode**: Theme switcher with persistent preferences
- **Responsive Design**: Mobile-first approach with desktop optimization
- **Loading States**: Comprehensive loading and error handling
- **Progress Tracking**: Visual progress indicators for minting
- **Error Handling**: Graceful error states and user feedback

## Installation

```
git clone https://github.com/metaplex-foundation/metaplex-nextjs-tailwind-template.git
```

## Setup

### Environment Configuration

The template uses Solana's public RPC endpoints by default. You can configure the network by setting environment variables:

```bash
# Optional: Set the Solana network (defaults to devnet)
NEXT_PUBLIC_SOLANA_NETWORK=devnet  # or testnet, mainnet-beta

# Required: Your Candy Machine ID for minting
NEXT_PUBLIC_CANDY_MACHINE_ID=your_candy_machine_id_here
```

### RPC Configuration

The project is configured to use public RPC endpoints for reliability and ease of setup. The RPC endpoint is automatically selected based on the network configuration in `src/providers/walletAdapterProvider.tsx`.

```ts
// src/providers/walletAdapterProvider.tsx
export const WalletAdapterProvider: FC<Props> = ({ children }) => {
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
  
  // Always use public RPC endpoints
  const endpoint = useMemo(() => {
    return clusterApiUrl(network as any);
  }, [network]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
```

### Component Structure

The template includes several reusable section components:

- **HeroSection**: Customizable hero banner with CTA buttons
- **AboutSection**: Feature showcase with two-column layout
- **StorySection**: Timeline-based storytelling component
- **MintSection**: Complete minting interface with progress tracking
- **TeamSection**: Team member cards with social links
- **Footer**: Responsive footer with navigation links

All sections accept props for customization and can be easily modified or extended.

## Key Features & Improvements

### Minting Experience
- **Progress Tracking**: Visual step-by-step progress during minting
- **Cancel Functionality**: Safe cancellation during preparation phases
- **Error Handling**: Comprehensive error states and user feedback
- **Rarity Display**: Automatic rarity calculation and display after minting

### Navigation & User Interface
- **Theme Switcher**: Toggle between light and dark modes
- **SOL Balance**: Real-time wallet balance display in navigation
- **Responsive Design**: Mobile-first approach with desktop optimization
- **Clean Styling**: Modern, minimal design with consistent spacing

### Wallet Integration
- **Multi-wallet Support**: Compatible with various Solana wallets
- **Connection Status**: Visual indicators for wallet connection state
- **Public RPC**: Reliable connection using Solana's public endpoints
- **Auto-refresh**: Automatic balance updates every 30 seconds

## Why Zustand?

Zustand is a global store that allows you to access the store state from both hooks and regular state fetching.

By storing the umiInstance in **zustand** we can access it in both `ts` and `tsx` files while also having the state update via other providers and hooks such as walletAdapter.

While it's normally easier to use the helper methods below to access umi you can also access the state methods manually by calling for the `umiStore` state yourself.

When fetching the umi state directly without a helper it will only pickup the umi instance and not the latest signer. By design when the walletAdapter changes state the state of the `signer` in the `umiStore` is updated but **NOT** applied to the `umi` state. So you will need to also pull the latest `signer` state and apply it to `umi`. This behaviour can be outlined in the `umiProvider.tsx` file. The helpers always pull a fresh instance of the `signer` state.

```ts
// umiProvider.tsx snippet
useEffect(() => {
  if (!wallet.publicKey) return
  // When wallet.publicKey changes, update the signer in umiStore with the new wallet adapter.
  umiStore.updateSigner(wallet as unknown as WalletAdapter)
}, [wallet.publicKey])
```

### Access Umi in .tsx

```ts
// Pulls the umi state from the umiStore using hook.
const umi = useUmiStore().umi
const signer = useUmiStore().signer

umi.use(signerIdentity(signer))
```

### Access Umi in .ts

```ts
// Pulls umi state from the umiStore.
const umi = useUmiStore.getState().umi
const signer = useUmiStore.getState().signer

umi.use(signerIdentity(signer))
```

## Helpers

Stored in the `/lib/umi` folder there are some pre made helps you can use to make your development easier.

Umi is split up into several components which can be called in different scenarios.

#### sendAndConfirmWithWalletAdapter()

Passing a transaction into `sendAndConfirmWithWalletAdapter()` will send the transaction while pulling the latest walletAdapter state from the zustand `umiStore` and will return the signature as a `string`. This can be accessed in both `.ts` and `.tsx` files.

The function also provides and locks in the commitment level across `blockhash`, `send`, and `confirm` if provide. By default `confirmed` is used.

We also have a `skipPreflight` flag that can be enabled.

If using priority fees it would best to set them here so they can globally be used by the send function or to remove them entirely if you do not wish to use them.

```ts
import useUmiStore from '@/store/useUmiStore'
import { setComputeUnitPrice } from '@metaplex-foundation/mpl-toolbox'
import { TransactionBuilder, signerIdentity } from '@metaplex-foundation/umi'
import { base58 } from '@metaplex-foundation/umi/serializers'

const sendAndConfirmWalletAdapter = async (
  tx: TransactionBuilder,
  settings?: {
    commitment?: 'processed' | 'confirmed' | 'finalized'
    skipPreflight?: boolean
  }
) => {
  const umi = useUmiStore.getState().umi
  const currentSigner = useUmiStore.getState().signer
  console.log('currentSigner', currentSigner)
  umi.use(signerIdentity(currentSigner!))

  const blockhash = await umi.rpc.getLatestBlockhash({
    commitment: settings?.commitment || 'confirmed',
  })

  const transactions = tx
    // Set the priority fee for your transaction. Can be removed if unneeded.
    .add(setComputeUnitPrice(umi, { microLamports: BigInt(100000) }))
    .setBlockhash(blockhash)

  const signedTx = await transactions.buildAndSign(umi)

  const signature = await umi.rpc
    .sendTransaction(signedTx, {
      preflightCommitment: settings?.commitment || 'confirmed',
      commitment: settings?.commitment || 'confirmed',
      skipPreflight: settings?.skipPreflight || false,
    })
    .catch((err) => {
      throw new Error(`Transaction failed: ${err}`)
    })

  const confirmation = await umi.rpc.confirmTransaction(signature, {
    strategy: { type: 'blockhash', ...blockhash },
    commitment: settings?.commitment || 'confirmed',
  })
  return {
    signature: base58.deserialize(signature),
    confirmation,
  }
}

export default sendAndConfirmWalletAdapter
```

#### umiWithCurrentWalletAdapter()

This fetches the current umi state with the current walletAdapter state from the `umiStore`. This is used to create transactions or perform operations with umi that requires the current wallet adapter user.

Can be used in both `.ts` and `.tsx` files

```ts
import useUmiStore from '@/store/useUmiStore'
import { signerIdentity } from '@metaplex-foundation/umi'

const umiWithCurrentWalletAdapter = () => {
  // Because Zustand is used to store the Umi instance, the Umi instance can be accessed from the store
  // in both hook and non-hook format. This is an example of a non-hook format that can be used in a ts file
  // instead of a React component file.

  const umi = useUmiStore.getState().umi
  const currentWallet = useUmiStore.getState().signer
  if (!currentWallet) throw new Error('No wallet selected')
  return umi.use(signerIdentity(currentWallet))
}
export default umiWithCurrentWalletAdapter
```

#### umiWithSigner()

`umiWithSigner()` allows you to pass in a signer element (`generateSigner()`, `createNoopSigner()`) and use it with the umi instance stored in the `umiStore` state.

```ts
import useUmiStore from '@/store/useUmiStore'
import { Signer, signerIdentity } from '@metaplex-foundation/umi'

const umiWithSigner = (signer: Signer) => {
  const umi = useUmiStore.getState().umi
  if (!signer) throw new Error('No Signer selected')
  return umi.use(signerIdentity(signer))
}

export default umiWithSigner
```

#### Example Transaction Using Helpers

Within the `/lib` folder you will find a `transferSol` example transaction that utilizes both the fetching of the umi state using `umiWithCurrentWalletAdapter()` and the sending of the generated transaction using `sendAndConfirmWithWalletAdapter()`.

By pulling state from the umi store with `umiWithCurrentWalletAdapter()` if any of our transaction args require the `signer` type this will be automatically pulled from the umi instance which is generated with walletAdapter. In this case the `from` account is determined by the current signer connected to umi (walletAdapter) and auto inferred in the transaction for us.

By then sending transaction with `sendAndConfirmWithWalletAdapter` the signing process will use the walletAdapter and ask the current user to signer the transaction. The transaction will be sent to the chain.

```ts
// Example of a function that transfers SOL from one account to another pulling umi
// from the useUmiStore in a ts file which is not a React component.

import { transferSol } from '@metaplex-foundation/mpl-toolbox'
import umiWithCurrentWalletAdapter from './umi/umiWithCurrentWalletAdapter'
import { publicKey, sol } from '@metaplex-foundation/umi'
import sendAndConfirmWalletAdapter from './umi/sendAndConfirmWithWalletAdapter'

// This function transfers SOL from the current wallet to a destination account and is callable
// from any tsx/ts or component file in the project because of the zustand global store setup.

const transferSolToDestination = async ({
  destination,
  amount,
}: {
  destination: string
  amount: number
}) => {
  // Import Umi from `umiWithCurrentWalletAdapter`.
  const umi = umiWithCurrentWalletAdapter()

  // Create a transactionBuilder using the `transferSol` function from the mpl-toolbox.
  // Umi by default will use the current signer (walletAdapter) to also set the `from` account.
  const tx = transferSol(umi, {
    destination: publicKey(destination),
    amount: sol(amount),
  })

  // Use the sendAndConfirmWithWalletAdapter method to send the transaction.
  // We do not need to pass the umi stance or wallet adapter as an argument because a
  // fresh instance is fetched from the `umiStore` in the `sendAndConfirmWithWalletAdapter` function.
  const res = await sendAndConfirmWalletAdapter(tx)
}

export default transferSolToDestination
```
