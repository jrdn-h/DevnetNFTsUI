import MetaMartianCollectionGallery from "@/components/MetaMartianCollectionGallery";

export const dynamic = "force-dynamic"; // optional: always fetch fresh JSON in dev

export default function CollectionPage() {
  // If you want to hardcode, you can pass collectionMint prop.
  // Otherwise, the component reads NEXT_PUBLIC_COLLECTION_MINT and builds the URL.
  return (
    <main className="mx-auto max-w-7xl p-4 sm:p-6">
      <MetaMartianCollectionGallery />
    </main>
  );
}
