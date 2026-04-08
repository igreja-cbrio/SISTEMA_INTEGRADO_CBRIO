require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

const USERS = [
  { name: 'Diretor', email: 'diretor@cbrio.com.br', role: 'diretor', password: 'diretor' },
  { name: 'Administração', email: 'admin@cbrio.com.br', role: 'admin', password: 'admin' },
  { name: 'Assistente', email: 'assistente@cbrio.com.br', role: 'assistente', password: '123' },
];

async function seed() {
  console.log('[SEED] Criando usuários...');
  for (const u of USERS) {
    const hash = await bcrypt.hash(u.password, 12);
    await pool.query(`
      INSERT INTO users (name, email, role, password_hash)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name, role = EXCLUDED.role, password_hash = EXCLUDED.password_hash
    `, [u.name, u.email, u.role, hash]);
    console.log(`  ✓ ${u.role}: ${u.email} (senha: ${u.password})`);
  }
  console.log('[SEED] Concluído!');
  await pool.end();
}

seed().catch(err => { console.error('[SEED] Erro:', err.message); process.exit(1); });
