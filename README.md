# Stock Management

Aplikasi manajemen stok dengan login berbasis role (Admin, Co-Admin, User).

| Bagian | Teknologi |
|---|---|
| Frontend (`frontend/`) | React + Vite, Tailwind CSS v4, Axios, React Router |
| Backend (`backend/`) | PHP 8.3+ + Laravel 13, Laravel Sanctum (token Bearer) |
| Database | PostgreSQL 18 |

## Hak akses

| Aksi | Admin | Co-Admin | User |
|---|---|---|---|
| Dashboard dan profil sendiri | ✅ | ✅ | ✅ |
| Lihat daftar user | ✅ | ✅ | ❌ |
| Tambah/ubah/hapus user biasa | ✅ | ✅ | ❌ |
| Kelola Co-Admin dan Admin, ubah role | ✅ | ❌ | ❌ |

Aturan tambahan: akun tidak bisa menghapus dirinya sendiri, dan Admin terakhir tidak bisa dihapus atau diturunkan rolenya.
Hak akses ditegakkan di backend (middleware `role` + `UserPolicy`); frontend hanya mengatur tampilan.

---

## 1. Prasyarat (install sekali per device)

| Tool | Catatan |
|---|---|
| Git | https://git-scm.com/download/win |
| Node.js (LTS atau lebih baru) | https://nodejs.org (sudah termasuk npm) |
| PHP 8.3+ | https://windows.php.net/download (Thread Safe x64), tambahkan ke PATH |
| Visual C++ Redistributable x64 | Dibutuhkan PHP di Windows |
| Composer | https://getcomposer.org/download |
| PostgreSQL 18 + pgAdmin 4 | https://www.postgresql.org/download/windows |

**Ekstensi PHP.** Salin `php.ini-development` menjadi `php.ini` di folder PHP, lalu hapus tanda `;` pada:

```
extension=pdo_pgsql
extension=pgsql
extension=fileinfo
extension=zip
extension=mbstring
extension=openssl
extension=curl
```

Cek instalasi (di CMD baru):

```
git --version
node -v
php -v
composer --version
php -m | findstr /i "pgsql fileinfo zip"
```

Atur identitas Git (sekali per device). Pakai email noreply GitHub agar email pribadi tidak terlihat publik:

```
git config --global user.name "Nama Kamu"
git config --global user.email "ID+username@users.noreply.github.com"
```

## 2. Setup project (sekali per device)

### a. Clone

```
git clone https://github.com/RaihanSulthon/RassanaStockManage.git
cd RassanaStockManage
```

### b. Buat database

Buka pgAdmin, login sebagai `postgres`, lalu jalankan di Query Tool **satu per satu**:

```sql
CREATE USER stockmanagerassana WITH PASSWORD 'GANTI_DENGAN_PASSWORD_KAMU';
```

```sql
CREATE DATABASE stock_management OWNER stockmanagerassana;
```

Username/password boleh berbeda di tiap device, asalkan sama dengan isi `.env` device itu.

### c. Backend

```
cd backend
copy .env.example .env
composer install
php artisan key:generate
```

Buka `backend\.env`, isi `DB_USERNAME` dan `DB_PASSWORD` sesuai langkah b, lalu simpan. Lanjutkan:

```
php artisan migrate --seed
```

### d. Frontend

```
cd ..\frontend
copy .env.example .env
npm install
```

## 3. Menjalankan (dua CMD terpisah)

```
cd backend
php artisan serve
```

```
cd frontend
npm run dev
```

Buka http://localhost:5173

### Akun awal (hasil seeder)

Isi `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_COADMIN_*`, dan `SEED_USER_*` di `backend\.env`, lalu jalankan `php artisan db:seed`. Akun yang variabelnya kosong akan dilewati.

> Jangan commit `.env` dan gunakan password yang kuat di production.

## 4. Alur kerja harian

Sebelum mulai kerja:

```
git pull
```

Lalu jalankan hanya yang relevan:

- `composer.json` / `composer.lock` berubah: `cd backend` lalu `composer install`
- `package.json` / `package-lock.json` berubah: `cd frontend` lalu `npm install`
- Ada migration baru: `cd backend` lalu `php artisan migrate`

Setelah selesai kerja:

```
git add .
git status
git commit -m "pesan perubahan"
git push
```

Selalu cek `git status` sebelum commit, pastikan tidak ada file `.env` di daftar.

## 5. Struktur backend singkat

| Lokasi | Fungsi |
|---|---|
| `routes/api.php` | Daftar endpoint API |
| `app/Http/Controllers/` | Menerima request dan mengembalikan JSON |
| `app/Models/` | Representasi tabel (relasi, casting) |
| `app/Policies/` | Aturan siapa boleh melakukan apa |
| `app/Http/Middleware/EnsureRole.php` | Pembatas akses per role |
| `database/migrations/` | Struktur tabel (versi terkontrol di git) |
| `database/seeders/` | Data awal (akun contoh) |

Perintah berguna (jalankan di folder `backend`):

```
php artisan route:list --path=api   # lihat semua endpoint
php artisan migrate                 # terapkan migration baru
php artisan migrate:rollback        # batalkan batch migration terakhir
php artisan tinker                  # konsol interaktif
php artisan test                    # jalankan test
```

Log error ada di `backend/storage/logs/laravel.log`.

## 6. Keamanan

- File `.env` **tidak boleh di-commit** (sudah di-ignore). Gunakan `.env.example` sebagai template, tanpa nilai rahasia.
- Semua variabel `VITE_*` di frontend **terlihat publik** di browser. Jangan simpan secret di sana.
- Di production, isi `FRONTEND_URL` di `backend/.env` dengan domain frontend yang sebenarnya (untuk CORS), dan set `APP_ENV=production`, `APP_DEBUG=false`.
- Kalau ada rahasia yang terlanjur ter-commit, ganti rahasia tersebut terlebih dahulu (menghapus file saja tidak cukup karena masih ada di history git).

## 7. Troubleshooting

| Masalah | Penyebab / solusi |
|---|---|
| `could not find driver` | Ekstensi `pdo_pgsql` belum aktif. Cek `php --ini` untuk memastikan `php.ini` yang dipakai. |
| `password authentication failed` | `DB_USERNAME`/`DB_PASSWORD` di `backend\.env` tidak cocok dengan user di PostgreSQL, atau `.env` belum disimpan. |
| FE: "Tidak dapat terhubung ke server" | BE belum jalan di port 8000, atau `VITE_API_URL` salah. Cek tab Console/Network di DevTools. |
| Error CORS di Console | Cek `FRONTEND_URL` di `backend\.env`. Saat `APP_ENV=local`, semua port localhost diizinkan. |
| Login "Terlalu banyak percobaan" | Login dibatasi 5 kali per menit. Tunggu sebentar. |
| Data di device A tidak muncul di device B | Normal. Database tidak ikut git, hanya strukturnya (migration) dan seeder. |
