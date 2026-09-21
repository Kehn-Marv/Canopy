import { createClient } from '@libsql/client/web';

export interface DirectoryProfile {
  username: string;
  fullName: string;
  email: string;
  institution: string;
}

// Ensure you configure these in your .env file
const url = import.meta.env.VITE_TURSO_DB_URL;
const authToken = import.meta.env.VITE_TURSO_DB_AUTH_TOKEN;

const client = (url && authToken) ? createClient({ url, authToken }) : null;

export async function registerUser(profile: DirectoryProfile): Promise<void> {
  if (!client) {
    console.warn('Turso DB not configured. User directory features will be disabled.');
    return;
  }
  
  try {
    await client.execute({
      sql: `
        INSERT INTO users (username, full_name, email, institution) 
        VALUES (?, ?, ?, ?)
        ON CONFLICT(username) DO UPDATE SET 
          full_name = excluded.full_name,
          email = excluded.email,
          institution = excluded.institution
      `,
      args: [profile.username, profile.fullName, profile.email, profile.institution]
    });
  } catch (error) {
    console.error('Failed to register user to global directory:', error);
    throw new Error('Failed to register username. It might be taken or the database is unavailable.');
  }
}

export async function searchUser(username: string): Promise<DirectoryProfile | null> {
  if (!client) {
    console.warn('Turso DB not configured. Cannot search user directory.');
    return null;
  }
  
  try {
    const result = await client.execute({
      sql: 'SELECT full_name, email, institution FROM users WHERE username = ?',
      args: [username.trim()]
    });
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      username: username.trim(),
      fullName: row.full_name as string,
      email: row.email as string,
      institution: row.institution as string
    };
  } catch (error) {
    console.error('Failed to search user directory:', error);
    throw new Error('Directory search failed. Please try again.');
  }
}
