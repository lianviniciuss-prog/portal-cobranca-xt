import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// As credenciais vêm do arquivo .env (ou das variáveis de ambiente do Vercel).
// Nunca coloque os valores diretamente aqui no código.
const firebaseConfig = {
  apiKey:        import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL:   import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId:     import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId:         import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
