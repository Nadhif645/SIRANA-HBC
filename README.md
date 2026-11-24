# SIRANA HBC

Aplikasi booking ruangan dan pelaporan kerusakan SMP Habibi Bina Cendikia untuk Guru/Wali Kelas, Wakasek Sarpras, Admin, dan Kepala Sekolah. Tidak ada akun siswa.

## Jalankan

```bash
npm install
npm run dev
```

Buka http://localhost:3001.

## Koneksi Supabase

Aplikasi menggunakan Supabase Auth, Database, dan Storage. Variabel berikut harus tersedia pada `.env.local` di folder aplikasi:

```env
NEXT_PUBLIC_SUPABASE_URL=URL_PROJECT_SUPABASE
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=KUNCI_PUBLISHABLE
```

Jangan gunakan service-role key di browser atau variabel `NEXT_PUBLIC_*`. Database migration `0001_initial_schema.sql` telah dijalankan pada project ini, jangan jalankan ulang. Jalankan migration `0002_damage_photos.sql` jika bucket foto belum tersedia, lalu jalankan `0003_sarpras_reports_and_daily_bookings.sql` dan `0004_requester_name_snapshots.sql` secara berurutan.

Pendaftaran umum membuat profil berstatus menunggu persetujuan. Admin pertama dibuat melalui Supabase Authentication, lalu profilnya dipromosikan di SQL Editor sebagaimana dijelaskan dalam `supabase/SETUP.md`. Pengguna dengan status pending atau nonaktif tidak bisa mengakses data aplikasi.

## Fitur yang tersambung

- Booking dan surat PDF privat tersimpan di Supabase.
- Jadwal tersedia berasal dari booking aktif, termasuk pengajuan yang masih ditinjau. Trigger database menolak jadwal yang bertabrakan.
- Laporan kerusakan dan foto opsional tersimpan pada tabel dan bucket privat.
- Nama pengaju disimpan bersama laporan/booking agar dapat ditampilkan tanpa membuka akses baca profil. Reviewer dapat membuka foto kerusakan ukuran penuh; alasan dan tahap penolakan tersimpan pada laporan.
- Sarpras mengisi rekomendasi sebelum meneruskan laporan/booking ke Kepala Sekolah; aplikasi membuat PDF privat yang dapat dibaca reviewer.
- Booking ruangan dapat diajukan setiap hari Senin sampai Minggu, pukul 07.00–16.00.
- Katalog dan status pemakaian ruangan tersimpan di Supabase.
- Admin dapat menyetujui profil, mengganti role, dan mengaktifkan atau menonaktifkan akun. Membuat atau menghapus akun Auth tetap memerlukan Dashboard Supabase atau fungsi server.

Akun Auth nyata dan hak aksesnya ditentukan Supabase, bukan pemilih role demo di browser.
