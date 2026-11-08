/** Acceso directo a la base de datos de pruebas (para sembrar datos y verificar resultados). */
import './entorno.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ESQUEMA = path.join(raiz, 'src', 'infrastructure', 'database', 'schema.sql');

/** Borra el esquema, lo recrea con schema.sql y devuelve un cliente abierto. */
export async function reiniciarEsquema() {
  const cliente = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await cliente.connect();
  await cliente.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await cliente.query(fs.readFileSync(ESQUEMA, 'utf8'));
  return cliente;
}
