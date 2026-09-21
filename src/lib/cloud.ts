import { createClient } from '@libsql/client/web';
import type { Asset, ChunkRecord, Grant } from '../types';

const url = import.meta.env.VITE_TURSO_DB_URL;
const authToken = import.meta.env.VITE_TURSO_DB_AUTH_TOKEN;

const client = (url && authToken) ? createClient({ url, authToken }) : null;

export async function uploadToCloud(asset: Asset, chunks: ChunkRecord[], grant: Grant): Promise<void> {
  if (!client) {
    console.warn('Turso DB not configured. Cloud sharing is disabled.');
    return;
  }
  
  // 1. Upload Asset metadata (as JSON)
  await client.execute({
    sql: `
      INSERT INTO cloud_assets (id, asset_json)
      VALUES (?, ?)
      ON CONFLICT(id) DO NOTHING
    `,
    args: [asset.id, JSON.stringify(asset)]
  });

  // 2. Upload Chunks
  const chunkQueries = chunks.map(chunk => ({
    sql: `
      INSERT INTO cloud_chunks (asset_id, chunk_index, iv, digest, data)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(asset_id, chunk_index) DO NOTHING
    `,
    args: [asset.id, chunk.index, chunk.iv, chunk.digest, chunk.data]
  }));
  
  if (chunkQueries.length > 0) {
    await client.batch(chunkQueries);
  }

  // 3. Upload Grant
  await client.execute({
    sql: `
      INSERT INTO cloud_grants (id, token_hash, asset_id, grant_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET 
        grant_json = excluded.grant_json
    `,
    args: [
      grant.id, 
      grant.id, // tokenHash is the grant id
      asset.id, 
      JSON.stringify(grant)
    ]
  });
}

export async function fetchGrantFromCloud(tokenHash: string): Promise<{grant: Grant, asset: Asset} | null> {
  if (!client) return null;
  
  try {
    const result = await client.execute({
      sql: 'SELECT * FROM cloud_grants WHERE token_hash = ?',
      args: [tokenHash]
    });
    if (result.rows.length === 0) return null;
    
    const grantRow = result.rows[0];
    const grant: Grant = JSON.parse(grantRow.grant_json as string);
    // Ensure we have the isRemote flag
    (grant as any).isRemote = true;
    
    const assetResult = await client.execute({
      sql: 'SELECT * FROM cloud_assets WHERE id = ?',
      args: [grant.assetId]
    });
    
    if (assetResult.rows.length === 0) return null;
    const assetRow = assetResult.rows[0];
    const asset: Asset = JSON.parse(assetRow.asset_json as string);
    (asset as any).isRemote = true;
    
    return { grant, asset };
  } catch (err) {
    console.error('Cloud fetch failed:', err);
    return null;
  }
}

export async function fetchChunkFromCloud(assetId: string, index: number): Promise<{iv: string, digest: string, data: ArrayBuffer} | null> {
  if (!client) return null;
  try {
    const result = await client.execute({
      sql: 'SELECT iv, digest, data FROM cloud_chunks WHERE asset_id = ? AND chunk_index = ?',
      args: [assetId, index]
    });
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      iv: row.iv as string,
      digest: row.digest as string,
      data: row.data as ArrayBuffer 
    };
  } catch (err) {
    console.error('Cloud chunk fetch failed:', err);
    return null;
  }
}
