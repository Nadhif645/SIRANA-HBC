# Menyiapkan Supabase untuk SIRANA HBC

Project Supabase sudah berisi schema awal yang menyiapkan profil dan persetujuan akun, katalog ruangan, booking dengan batas kapasitas, laporan kerusakan, serta bucket privat untuk surat booking PDF.

## Jalankan schema sekali

1. Buka project Supabase `zckpewnztgllsyhdlkod`.
2. Buka **SQL Editor**, lalu pilih **New query**.
3. Buka `supabase/migrations/0001_initial_schema.sql` di project ini, salin seluruh isinya ke SQL Editor, lalu tekan **Run**.
4. Buka **Table Editor**. Pastikan tabel `profiles`, `rooms`, `room_bookings`, dan `damage_tickets` muncul. Bucket `booking-letters` dapat dilihat di **Storage**.
5. Pastikan tiga ruangan dari data prasarana tercatat. Statusnya dimulai sebagai **tentatif**, karena dokumen sumber menandainya “Terpakai”. Admin perlu memastikan ketersediaannya sebelum membuka booking.

Migration `0001_initial_schema.sql` sudah dijalankan pada project yang dipakai aplikasi. Jangan jalankan ulang migration awal. Jalankan migration `0002_damage_photos.sql` jika bucket foto belum tersedia, lalu jalankan `0003_sarpras_reports_and_daily_bookings.sql` satu kali di SQL Editor untuk PDF rekomendasi privat, penolakan per tahap, dan booking setiap hari. Setelah itu jalankan `0004_requester_name_snapshots.sql` satu kali untuk mengisi nama pengaju pada data lama dan menyimpan nama pengaju pada laporan/booking baru. Jalankan `0005_protect_linked_sarpras_reports.sql` setelahnya untuk mencegah PDF rekomendasi yang sudah terhubung dihapus. Jika SQL Editor menampilkan error, simpan pesan error lengkap dan perbaiki dulu sebelum mencoba lagi.

## Buat Admin pertama

Admin tidak mendaftar melalui formulir publik. Buat pengguna dengan email Admin melalui **Authentication → Users → Add user**, lalu jalankan query berikut di SQL Editor untuk mengaktifkan profil dan memberi role Admin:

```sql
update public.profiles
set role = 'admin',
    requested_role = 'admin',
    approval_status = 'approved',
    is_active = true,
    updated_at = now()
where email = 'adminhbc123@gmail.com';
```

Gunakan kata sandi baru yang unik, bukan kata sandi yang sempat dikirim di percakapan. Jangan simpan kata sandi di kode atau file `.env`.

## Menyetujui akun Guru, Sarpras, dan Kepala Sekolah

Migration membuat profil baru dengan status `pending` dan `is_active = false`. Role Admin tidak dapat dipilih lewat metadata pendaftaran. Setelah akun Auth dibuat, Admin dapat mengaktifkannya dengan menetapkan role yang diminta, misalnya:

```sql
update public.profiles
set role = requested_role,
    approval_status = 'approved',
    is_active = true,
    updated_at = now()
where email = 'email-akun-yang-disetujui@example.com'
  and requested_role in ('guru', 'sarpras', 'kepsek')
  and approval_status = 'pending';
```

Ganti email contoh dengan alamat yang benar. Jangan menyetujui akun sebelum identitas dan perannya diperiksa.

## Pengelolaan akun oleh Admin

RLS migration mengizinkan Admin aktif memperbarui profil. Menghapus pengguna Auth tidak boleh dilakukan langsung dari browser karena operasi Admin Auth memerlukan hak server. Fungsi aman untuk tombol **Hapus akun** tersedia di `supabase/functions/admin-delete-user/index.ts`. Pada proyek yang sedang dipakai, fungsi sudah dibuat melalui Dashboard dengan slug `super-action`, dan aplikasi memanggil nama tersebut.

Untuk deploy lewat **Edge Functions → Deploy a new function → Via Editor**, gunakan nama yang sama dengan yang dipanggil aplikasi, yaitu `super-action`, tempel isi file tersebut, lalu pilih **Deploy function**.

Fungsi memvalidasi sesi dan role Admin di server. Fungsi menolak penghapusan akun Admin, akun yang sedang dipakai, dan akun yang memiliki riwayat booking atau laporan. Riwayat tetap dipertahankan; nonaktifkan akun jika hanya ingin mencabut akses. Jangan menaruh service-role key di `NEXT_PUBLIC_*` atau kode browser.

## Menghubungkan aplikasi

Aplikasi membaca `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` dari `.env.local` di folder project. Nilai URL dan publishable key tidak perlu dibagikan. Jangan pernah memakai service-role key di browser.

Pastikan URL lokal `http://localhost:3001/**` ditambahkan pada **Authentication → URL Configuration → Redirect URLs** jika konfirmasi email diaktifkan. Pengguna daftar sendiri sebagai Guru/Wali Kelas, Wakasek Sarpras, atau Kepala Sekolah. Profil tetap pending sampai Admin memeriksa dan menyetujuinya. Admin pertama harus dibuat melalui **Authentication → Users** lalu dipromosikan pada `profiles` menggunakan query di atas.

## Booking dan laporan PDF

- Jadwal berlaku Senin sampai Minggu, pukul 07.00 sampai 16.00, dengan waktu booking per menit.
- Satu ruangan hanya boleh memiliki satu booking aktif dalam satu rentang waktu. Pengajuan yang masih menunggu Sarpras atau Kepala Sekolah ikut menahan jamnya agar pengajuan lain tidak bisa masuk pada waktu yang sama. Penolakan atau pembatalan melepaskan waktu itu.
- Kapasitas booking adalah jumlah pengguna dan tidak boleh melebihi kapasitas maksimum ruangan. Kapasitas tidak dapat dipakai untuk berbagi ruangan pada jam yang sama.
- Booking yang disetujui tersusun berurutan berdasarkan tanggal dan jam. Saat jamnya berlangsung, ruangan ditandai sedang digunakan; setelah selesai, booking berikutnya pada antrean mulai sesuai jadwal.
- Admin dapat mencatat pemakaian manual ruangan dari waktu sekarang sampai tanggal dan jam yang dipilih. Database menolak rentang yang bertabrakan dengan booking aktif. Setelah batas waktu lewat, rentang tersebut tidak lagi menghalangi booking, jadi tidak perlu cron atau penghapusan manual.
- PDF sumber tidak mencantumkan jam selesai pemakaian ruangan. Admin harus memastikan waktu selesai yang sebenarnya sebelum membuka booking.
- Database mengunci baris ruangan saat memeriksa jadwal agar dua pengajuan yang masuk bersamaan tidak dapat memesan waktu yang bertabrakan. Trigger juga memastikan jumlah pengguna tidak melebihi kapasitas ruangan serta memeriksa tabrakan dengan waktu pemakaian manual.
- Surat hanya boleh berformat PDF dan bucket `booking-letters` bersifat privat. Kebijakan Storage membatasi unggahan ke akun Guru/Wali Kelas yang sudah disetujui, serta pembacaan ke pengaju dan reviewer Sarpras/Kepala Sekolah/Admin.
- Foto kerusakan menggunakan bucket privat `damage-photos` dari migration `0002_damage_photos.sql`. Ukuran maksimum 3 MB; hanya pengaju dan reviewer berwenang yang dapat membacanya.
- Laporan rekomendasi Sarpras dibuat menjadi PDF dari catatan pemeriksaan, lalu disimpan di bucket privat `sarpras-reports` dari migration `0003_sarpras_reports_and_daily_bookings.sql`. Pengaju dan reviewer terkait dapat membacanya.
- Untuk integrasi nanti, simpan file di path `{auth.uid()}/{uuid}.pdf`, lalu isi `room_bookings.letter_path` dengan path itu. Database menolak booking yang path suratnya bukan milik akun pengaju.

## Catatan kondisi aplikasi

Aplikasi memakai Supabase Auth, Database, dan Storage ketika dibuka. Data hanya muncul sesuai kebijakan RLS. Menu Kelola akun memperbarui role, persetujuan, dan status aktif profil. Membuat/menghapus pengguna Auth atau mengganti email bukan operasi browser dan perlu dilakukan dari Dashboard atau fungsi server yang memvalidasi role Admin.

## Keamanan

- `.env.local` berada di folder aplikasi dan diabaikan Git.
- Publishable key boleh dipakai di browser. Jangan pernah menaruh `service_role` atau secret key dalam variabel `NEXT_PUBLIC_*`.
- Migration ini tidak memerlukan service-role key dari Anda.
