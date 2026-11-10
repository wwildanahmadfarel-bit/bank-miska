# Bank Miska — Web Admin, Teller, dan Nasabah

Aplikasi bank praktik sekolah: tabungan, pinjaman, merchant/QR, dan akuntansi
otomatis. Next.js 16 (App Router) + MySQL, siap deploy ke Vercel.

## Menjalankan lokal

```bash
npm install
cp .env.example .env.local   # Windows: copy .env.example .env.local
# isi DB_HOST/DB_PORT/DB_USER/DB_PASS/DB_NAME + JWT_SECRET
npm run db:migrate           # buat/rapikan tabel + seed bcrypt
npm run dev
```

Buka `http://localhost:3000`. Akun demo lokal:

| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | admin |
| `teller` | `teller123` | teller |
| `siswa` | `siswa123` | nasabah (H2478) |

> Password demo di atas hanya untuk lokal. Untuk production, isi
> `SEED_ADMIN_PASSWORD`, `SEED_TELLER_PASSWORD`, `SEED_SISWA_PASSWORD` di
> `.env.local`, lalu jalankan `npm run db:init` atau `npm run db:seed-prod`.

## Perintah penting

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Server development |
| `npm run build` | Build produksi |
| `npm test` | Unit test (JWT, bcrypt, tanggal, dll.) |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Migrasi lokal idempotent + seed bcrypt |
| `npm run db:init` | Buat DB + import `docs/schema-baru.sql` + seed production |
| `npm run db:seed-prod` | Ganti password akun inti dari `SEED_*` (bcrypt) |
| `npm run db:import -- file.sql` | Import dump lokal ke DB tujuan |

## Deploy Vercel + Aiven MySQL

1. Buat service **Aiven MySQL Free**, catat host, port, user, password, dan
   buat database `db_ukkcashless`.
2. Isi `.env.local` dengan kredensial Aiven:
   `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME=db_ukkcashless`,
   `DB_SSL=true`, `DB_POOL=1`, `DB_TIMEZONE=+07:00`,
   `JWT_SECRET` (min. 32 karakter), `APP_TIMEZONE=Asia/Jakarta`, dan `SEED_*`.
   Jangan tambahkan `TZ`; nama itu dicadangkan Vercel. Zona waktu diatur oleh
   `APP_TIMEZONE` dan `DB_TIMEZONE`.
3. Siapkan database dari komputer lokal. Bisa langsung memakai `.env.local`,
   atau file kredensial cloud terpisah agar dev lokal tetap ke MySQL lokal:
   ```powershell
   $env:ENV_FILE=".env.aiven"; npm run db:init
   ```
4. Deploy:
   ```bash
   npx vercel login
   npx vercel link --yes
   # tambahkan env production (DB_*, JWT_SECRET, APP_TIMEZONE) lewat dashboard/CLI
   # Masukkan HANYA nilainya: DB_HOST=host-aiven, bukan "DB_HOST=host-aiven".
   npx vercel --prod
   ```
5. Buka `https://<domain>/api/health` — pastikan `db: true`, `hilang: []`,
   `jwt: true`, dan `db_zona: +07:00`.
6. Login memakai password dari `SEED_ADMIN_PASSWORD` / `SEED_TELLER_PASSWORD`
   di `.env.aiven`, bukan password demo lokal.
7. Agar situs dan API bisa diakses publik/mobile, matikan Deployment Protection
   Vercel Authentication:
   ```powershell
   npx vercel project protection disable miska-next --sso
   ```
   Alternatif: pasang custom domain (domain kustom tidak terkena SSO).

## Client lain

- Mobile banking: `../miska-mobile` (Expo, `Authorization: Bearer <JWT>`).
- Rencana kasir mandiri & pembayaran dari HP: lihat
  `../docs/INTEGRASI-CLIENT.md`.
