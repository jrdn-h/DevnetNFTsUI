import { NextRequest, NextResponse } from "next/server";

export const revalidate = 300; // cache this route's data for 5m at the Next.js layer

const LIMIT = 1000;           // DAS max page size
const MAX_PAGES = 10;         // safety guard for whales

type MinimalAsset = {
  id: string;
  content: { json_uri?: string; metadata?: { name?: string } };
  links?: { image?: string };
};

export async function GET(req: NextRequest) {
  const owner = req.nextUrl.searchParams.get("owner") || "";
  const collection = req.nextUrl.searchParams.get("collection") || "";
  const HELIUS = process.env.HELIUS_RPC_URL; // e.g. https://mainnet.helius-rpc.com/?api-key=...

  if (!owner || !collection) {
    return NextResponse.json({ error: "owner & collection required" }, { status: 400 });
  }
  if (!HELIUS) {
    return NextResponse.json({ error: "Missing HELIUS_RPC_URL" }, { status: 500 });
  }

  // 1) Primary path: searchAssets with owner + grouping (collection) in one request
  //    tokenType=nonFungible to keep it to NFTs only. Page from 1..N.
  //    (Docs: ownerAddress, tokenType, grouping, page/limit, and displayOptions) 
  //    https://www.helius.dev/docs/das/search  + API ref
  const baseParams = {
    ownerAddress: owner,
    grouping: ["collection", collection],
    tokenType: "nonFungible" as const,
    // NOTE: docs call these "Display Options (`options`)" but examples use `displayOptions`.
    // We'll use `displayOptions` to match examples.
    displayOptions: { showCollectionMetadata: false },
  };

  const all: MinimalAsset[] = [];
  let page = 1;

  try {
    // page through in case the wallet holds > LIMIT assets in this collection
    for (; page <= MAX_PAGES; page++) {
      const body = {
        jsonrpc: "2.0",
        id: `wallet-collection-${page}`,
        method: "searchAssets",
        params: { ...baseParams, page, limit: LIMIT },
      };

      const r = await fetch(HELIUS, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        next: { revalidate: 300, tags: [`wallet:${owner}:${collection}`] }, // cache tag for on-demand revalidation
      });

      const j: any = await r.json().catch(() => null);
      if (!r.ok || j?.error) {
        throw new Error(`searchAssets error: ${j?.error?.message || r.statusText} (${r.status})`);
      }

      // Current docs show result.assets.items (+ pagination fields)
      // Older shapes sometimes had result.items; we normalize defensively.
      const assetsBlock = j?.result?.assets ?? j?.assets ?? j?.result ?? {};
      const items: any[] =
        assetsBlock?.items ??
        j?.result?.items ??
        [];

      // Normalize down to just what the client needs (smaller payload)
      for (const a of items) {
        all.push({
          id: a?.id,
          content: {
            json_uri: a?.content?.json_uri,
            metadata: { name: a?.content?.metadata?.name },
          },
          links: { image: a?.content?.links?.image },
        });
      }

      const total: number = Number(assetsBlock?.total ?? all.length);
      const limit: number = Number(assetsBlock?.limit ?? LIMIT);
      if (!Array.isArray(items) || items.length < limit || all.length >= total) break;
    }

    // If nothing came back (rare edge), fall back to owner scan then filter by grouping
    if (all.length === 0) {
      const fb = await fetch(HELIUS, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "fallback",
          method: "getAssetsByOwner",
          params: {
            ownerAddress: owner,
            page: 1,
            limit: LIMIT,
            options: {
              showUnverifiedCollections: true,
              showCollectionMetadata: false,
              showGrandTotal: false,
              showFungible: false,
              showNativeBalance: false,
              showInscription: false,
              showZeroBalance: false,
            },
          },
        }),
        next: { revalidate: 300, tags: [`wallet:${owner}:${collection}`] },
      }).then((r) => r.json()).catch(() => null);

      const fItems: any[] =
        fb?.result?.items ?? fb?.assets?.items ?? [];

      for (const a of fItems) {
        const inCollection =
          Array.isArray(a?.grouping) &&
          a.grouping.some((g: any) => g?.group_key === "collection" && g?.group_value === collection);
        if (!inCollection) continue;
        all.push({
          id: a?.id,
          content: {
            json_uri: a?.content?.json_uri,
            metadata: { name: a?.content?.metadata?.name },
          },
          links: { image: a?.content?.links?.image },
        });
      }
    }

    return NextResponse.json(all, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Upstream error" },
      { status: 502 }
    );
  }
}
