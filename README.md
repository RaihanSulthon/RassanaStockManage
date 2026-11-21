# Stock Management

Aplikasi manajemen stok perusahaan catering: stok bahan & barang di gudang dan lapangan, alur UR → PR → PO → approval → penerimaan → pembayaran.

| Bagian | Teknologi |
|---|---|
| Frontend (`frontend/`) | React + Vite, Tailwind CSS v4, Axios, React Router |
| Backend (`backend/`) | PHP 8.3+ + Laravel 13, Laravel Sanctum (token Bearer) |
| Database | PostgreSQL 18 |

## Role & tugas

| Role | Lokasi | Tugas di sistem |
|---|---|---|
| User | Lapangan (dapur) | Catat pemakaian harian, lihat saldo stok lapangan, catat penerimaan barang dari gudang |
| Operation1 | Lapangan | Sama seperti User + buat UR ke gudang |
| Logistic | Gudang | Kelola barang gudang (tanpa harga), evaluasi UR, buat PR (acuan min/max), terima barang vendor (bisa bertahap), kirim barang ke lapangan, tindak lanjut selisih kiriman, ubah stok gudang |
| Purchasing | Semua | Validasi PR dengan data stok, buat PO + harga, revisi PO, kirim PO ke vendor, kelola master barang (min/max, harga) dan vendor |
| Finance | Semua | Approval / minta revisi PO, cek PO + surat jalan + penerimaan gudang, siapkan & lakukan pembayaran |
| Admin | Semua | Buat gudang & lapangan, kelola akun & penugasan lokasi, lihat semua data, ubah stok |

- **Harga** hanya terlihat oleh Purchasing, Finance, dan Admin (di layar maupun PDF/Excel). Logistic, Operation, dan User hanya melihat jumlah & jenis barang.
- **Lokasi:** beberapa gudang; tiap gudang melayani satu atau beberapa lapangan. Gudang & lapangan hanya dibuat oleh Admin. Vendor dikelola Admin, Purchasing, dan Finance. Logistic ditugaskan ke gudang, Operation ke satu/lebih lapangan, User ke satu lapangan (diatur Admin di Kelola User). Operation dan User tidak bisa melihat stok gudang sama sekali.
- Hak akses ditegakkan di backend (`app/Policies` + middleware `role`); frontend hanya mengatur tampilan.

## Alur (sesuai activity diagram)

1. **User / Operation** mencatat pemakaian harian (saldo lapangan berkurang). **Operation** membuat **UR** → kirim ke Logistic.
2. **Logistic** mengevaluasi UR, lalu membuat **PR** (1 UR → 1 PR, atau PR estimasi tanpa UR) dengan acuan stok minimal & maksimal → kirim ke Purchasing.
3. **Purchasing** memvalidasi PR (melihat stok gudang & lapangan), membuat **PO** (1 PR → 1 PO) dengan vendor & harga → kirim ke Finance.
4. **Finance** menyetujui atau meminta revisi. Jika disetujui, sistem memberi notifikasi ke Purchasing (PO valid) dan Logistic (PO sudah dibuat dari PR-nya).
5. **Purchasing** menandai PO sudah dikirim ke vendor (proses vendor di luar sistem).
6. **Logistic** mencatat penerimaan barang + nomor surat jalan. Bisa bertahap; stok gudang sebelum & sesudah tercatat per penerimaan. Stok gudang bertambah.
7. **Logistic** mengirim barang ke lapangan (stok gudang berkurang); **User / Operation** mencatat jumlah yang benar-benar diterima (stok lapangan bertambah). Jika kurang, Logistic menindaklanjuti: hilang, belum terkirim (kembali ke gudang), atau tertinggal di perjalanan (diterima susulan).
8. **Finance** mencatat tagihan vendor (dibandingkan dengan total PO dan nilai barang diterima), lalu melakukan pembayaran.

Dokumen dikerjakan di sistem (bukan file). File hanya dibuat saat klik **Generate PDF / Generate Excel**: UR, PR, PO, riwayat penerimaan, laporan saldo stok (harian/mingguan/bulanan), dan bukti pembayaran.

Data contoh (2 gudang, 3 lapangan, 10 barang, 3 vendor, saldo awal): `php artisan db:seed --class=DemoDataSeeder`.

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

Isi `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_PURCHASING_*`, `SEED_FINANCE_*`, `SEED_OPERATION1_*`, dan `SEED_USER_*` di `backend\.env`, lalu jalankan `php artisan db:seed`. Akun yang variabelnya kosong akan dilewati.

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
