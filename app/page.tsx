'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import Image from 'next/image'
import {
  ArrowRight,
  BookOpenCheck,
  Building2,
  CalendarDays,
  Check,

  CircleHelp,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  FilePlus2,
  FileText,
  ImagePlus,
  LayoutDashboard,
  Menu,
  Plus,
  ShieldCheck,
  Trash2,
  TicketCheck,

  Upload,

  Users,
  X,
} from 'lucide-react'
import { AuthView } from '@/app/auth-view'
import { BrandLogo } from '@/app/brand-logo'
import { supabase } from '@/lib/supabase'

type Role = 'guru' | 'sarpras' | 'kepsek' | 'admin'
type RoomStatus = 'tersedia' | 'tentatif'
type TicketStatus =
  | 'diajukan'
  | 'verifikasi_sarpras'
  | 'verifikasi_lapangan'
  | 'menunggu_kepsek'
  | 'proses_perbaikan'
  | 'selesai'
  | 'ditolak'
type BookingStatus =
  | 'diajukan_sarpras'
  | 'menunggu_kepsek'
  | 'disetujui'
  | 'ditolak'
  | 'dibatalkan'
type View = 'dashboard' | 'tickets' | 'new-ticket' | 'booking' | 'reviews' | 'rooms' | 'accounts'
type AccountApprovalStatus = 'pending' | 'approved' | 'rejected'

interface Room {
  id: string
  code: string
  name: string
  location: string
  capacity: number
  status: RoomStatus
  occupiedFrom: string | null
  occupiedUntil: string | null
  facilities: string
}

interface Ticket {
  id: string
  number: string
  title: string
  category: string
  equipment: string
  location: string
  description: string
  photoName: string | null
  photoData: string | null
  createdAt: string
  status: TicketStatus
  rejectionNote?: string | null
}

interface Booking {
  id: string
  roomId: string
  date: string
  start: string
  end: string
  requestedCapacity: number
  purpose: string
  letterId: string | null
  letterName: string | null
  requester: string
  requesterId: string | null
  createdAt: string
  status: BookingStatus
  rejectionNote?: string | null
}

interface ManagedAccount {
  id: string
  fullName: string
  email: string
  role: Role
  requestedRole: Role
  approvalStatus: AccountApprovalStatus
  isActive: boolean
  createdAt: string
}

interface PrototypeData {
  role: Role
  rooms: Room[]
  tickets: Ticket[]
  bookings: Booking[]
  accounts: ManagedAccount[]
}


const ROLES: { id: Role; label: string; description: string }[] = [
  { id: 'guru', label: 'Guru / Wali Kelas', description: 'Mengajukan booking dan laporan' },
  { id: 'sarpras', label: 'Wakasek Sarpras', description: 'Memeriksa dan memberi rekomendasi' },
  { id: 'kepsek', label: 'Kepala Sekolah', description: 'Memberi keputusan akhir' },
  { id: 'admin', label: 'Admin', description: 'Mengelola akun dan data ruangan' },
]


const TICKET_LABELS: Record<TicketStatus, string> = {
  diajukan: 'Diajukan',
  verifikasi_sarpras: 'Verifikasi Sarpras',
  verifikasi_lapangan: 'Verifikasi Lapangan',
  menunggu_kepsek: 'Menunggu Kepala Sekolah',
  proses_perbaikan: 'Proses Perbaikan',
  selesai: 'Selesai',
  ditolak: 'Ditolak',
}

const BOOKING_LABELS: Record<BookingStatus, string> = {
  diajukan_sarpras: 'Menunggu rekomendasi Sarpras',
  menunggu_kepsek: 'Menunggu persetujuan Kepala Sekolah',
  disetujui: 'Disetujui',
  ditolak: 'Ditolak',
  dibatalkan: 'Dibatalkan',
}
const ACTIVE_BOOKING_STATUSES = new Set<BookingStatus>(['diajukan_sarpras', 'menunggu_kepsek', 'disetujui'])
const SCHOOL_START_MINUTE = 7 * 60
const SCHOOL_END_MINUTE = 16 * 60
const SCHEDULE_STEP_MINUTES = 30

const TICKET_STEPS: TicketStatus[] = [
  'diajukan',
  'verifikasi_sarpras',
  'verifikasi_lapangan',
  'menunggu_kepsek',
  'proses_perbaikan',
  'selesai',
]

const NAVIGATION: { id: View; label: string; icon: typeof LayoutDashboard; roles: Role[] }[] = [
  { id: 'dashboard', label: 'Ringkasan', icon: LayoutDashboard, roles: ['guru', 'sarpras', 'kepsek', 'admin'] },
  { id: 'tickets', label: 'Laporan kerusakan', icon: ClipboardList, roles: ['guru', 'sarpras', 'kepsek', 'admin'] },
  { id: 'new-ticket', label: 'Buat laporan', icon: FilePlus2, roles: ['guru'] },
  { id: 'booking', label: 'Booking ruangan', icon: CalendarDays, roles: ['guru', 'sarpras', 'kepsek', 'admin'] },
  { id: 'reviews', label: 'Perlu ditinjau', icon: ClipboardCheck, roles: ['sarpras', 'kepsek'] },
  { id: 'rooms', label: 'Data ruangan', icon: Building2, roles: ['admin'] },
  { id: 'accounts', label: 'Kelola akun', icon: Users, roles: ['admin'] },
]

function todayLocal() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatDate(value: string) {
  if (!value) return 'Pilih tanggal'
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00`))
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' })
    .format(new Date(`2000-01-01T${value}:00`))
}

function formatLocalDateTime(value: string) {
  const [date, time] = value.split('T')
  return `${formatDate(date)} pukul ${formatTime(time.slice(0, 5))}`
}

function toLocalDateTime(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function roomOccupancyOverlaps(room: Room, date: string, start: string, end: string) {
  if (!room.occupiedFrom || !room.occupiedUntil) return false
  const busyStart = new Date(room.occupiedFrom).getTime()
  const busyEnd = new Date(room.occupiedUntil).getTime()
  const requestedStart = new Date(`${date}T${start}:00`).getTime()
  const requestedEnd = new Date(`${date}T${end}:00`).getTime()
  return requestedStart < busyEnd && requestedEnd > busyStart
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

function overlaps(startA: string, endA: string, startB: string, endB: string) {
  return timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(endA) > timeToMinutes(startB)
}

function findBookingConflict(bookings: Booking[], roomId: string, date: string, start: string, end: string) {
  return bookings.find((booking) =>
    booking.roomId === roomId && booking.date === date &&
    ACTIVE_BOOKING_STATUSES.has(booking.status) && overlaps(start, end, booking.start, booking.end),
  )
}

function currentRoomUse(room: Room, bookings: Booking[], now: number) {
  if (room.occupiedFrom && room.occupiedUntil &&
    new Date(room.occupiedFrom).getTime() <= now && new Date(room.occupiedUntil).getTime() > now) {
    const endLabel = room.occupiedFrom.slice(0, 10) === room.occupiedUntil.slice(0, 10)
      ? formatTime(room.occupiedUntil.slice(11, 16))
      : formatLocalDateTime(room.occupiedUntil)
    return {
      endTime: room.occupiedUntil.slice(11, 16),
      label: `Terpakai sampai ${endLabel}`,
      isApproved: true,
    }
  }
  const today = todayLocal()
  const ongoing = bookings.filter((booking) =>
    booking.roomId === room.id && booking.date === today &&
    ['diajukan_sarpras', 'menunggu_kepsek', 'disetujui'].includes(booking.status) &&
    new Date(`${booking.date}T${booking.start}:00`).getTime() <= now &&
    new Date(`${booking.date}T${booking.end}:00`).getTime() > now,
  )
  if (ongoing.length === 0) return null
  const approved = ongoing.filter((booking) => booking.status === 'disetujui')
  const relevant = approved.length > 0 ? approved : ongoing
  const endTime = relevant.map((booking) => booking.end).sort().at(-1) ?? ''
  return {
    endTime,
    label: approved.length > 0 ? `Terpakai sampai ${formatTime(endTime)}` : `Menunggu persetujuan sampai ${formatTime(endTime)}`,
    isApproved: approved.length > 0,
  }
}

function roleLabel(role: Role) {
  return ROLES.find((item) => item.id === role)?.label ?? 'Guru / Wali Kelas'
}

function statusClass(status: string) {
  if (['selesai', 'disetujui', 'proses_perbaikan'].includes(status)) return 'status status-green'
  if (['ditolak', 'dibatalkan'].includes(status)) return 'status status-muted'
  if (['menunggu_kepsek', 'verifikasi_lapangan'].includes(status)) return 'status status-gold'
  return 'status status-teal'
}

function dateIsWeekday(value: string) {
  if (!value) return false
  const day = new Date(`${value}T12:00:00`).getDay()
  return day >= 1 && day <= 5
}

export default function HomePage() {
  const [data, setData] = useState<PrototypeData>({ role: 'guru', rooms: [], tickets: [], bookings: [], accounts: [] })
  const [ready, setReady] = useState(false)
  const [authLoading, setAuthLoading] = useState(Boolean(supabase))
  const [authUser, setAuthUser] = useState<{ id: string; email: string } | null>(null)
  const [profile, setProfile] = useState<{ id: string; fullName: string; role: Role; approvalStatus: AccountApprovalStatus; isActive: boolean; requestedRole: Role } | null>(null)
  const [connectionError, setConnectionError] = useState(supabase ? '' : 'Konfigurasi Supabase belum lengkap. Isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY di .env.local.')
  const [view, setView] = useState<View>('dashboard')
  const [notice, setNotice] = useState('')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [bookingDate, setBookingDate] = useState(() => todayLocal())
  const [bookingRoom, setBookingRoom] = useState('')
  const [bookingStart, setBookingStart] = useState('09:00')
  const [bookingEnd, setBookingEnd] = useState('10:00')
  const [bookingCapacity, setBookingCapacity] = useState('1')
  const [bookingLetter, setBookingLetter] = useState<File | null>(null)
  const [bookingSubmitting, setBookingSubmitting] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [openDocument, setOpenDocument] = useState<{ name: string; url: string } | null>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const [photo, setPhoto] = useState<{ name: string; data: string; file: File } | null>(null)

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return
      setAuthUser(session?.user ? { id: session.user.id, email: session.user.email ?? '' } : null)
      setAuthLoading(false)
    }).catch((error: unknown) => {
      if (!active) return
      setConnectionError(error instanceof Error ? error.message : 'Sesi Supabase tidak dapat diperiksa.')
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ? { id: session.user.id, email: session.user.email ?? '' } : null)
      setProfile(null)
      setConnectionError('')
      setReady(false)
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!supabase || !authUser) return
    let active = true
    async function loadFromSupabase() {
      const profileResult = await supabase!.from('profiles').select('id, full_name, email, role, requested_role, approval_status, is_active, created_at').eq('id', authUser!.id).single()
      if (!active) return
      if (profileResult.error) {
        setConnectionError(`Profil Supabase tidak dapat dimuat: ${profileResult.error.message}`)
        setReady(true)
        return
      }
      const profileRow = profileResult.data
      const role = profileRow.role as Role
      setProfile({ id: profileRow.id, fullName: profileRow.full_name, role, requestedRole: profileRow.requested_role as Role, approvalStatus: profileRow.approval_status as AccountApprovalStatus, isActive: profileRow.is_active })
      setData((previous) => ({ ...previous, role }))
      if (profileRow.approval_status !== 'approved' || !profileRow.is_active) {
        setData((previous) => ({ ...previous, rooms: [], tickets: [], bookings: [], accounts: [] }))
        setReady(true)
        return
      }
      const [roomsResult, bookingsResult, ticketsResult, profilesResult] = await Promise.all([
        supabase!.from('rooms').select('*').order('name'),
        Promise.all([
          supabase!.from('room_bookings').select('*').order('booking_date').order('start_time'),
          supabase!.from('booking_slots').select('*').order('booking_date').order('start_time'),
        ]),
        supabase!.from('damage_tickets').select('*').order('created_at', { ascending: false }),
        role === 'admin' ? supabase!.from('profiles').select('*').order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
      ])
      if (!active) return
      const [bookingDetailsResult, bookingSlotsResult] = bookingsResult
      const failure = roomsResult.error ?? bookingDetailsResult.error ?? bookingSlotsResult.error ?? ticketsResult.error ?? profilesResult.error
      if (failure) {
        setConnectionError(`Data Supabase tidak dapat dimuat: ${failure.message}`)
        setReady(true)
        return
      }
      const rooms = (roomsResult.data ?? []).map((room) => ({
        id: room.id, code: room.code, name: room.name, location: room.location, capacity: room.capacity,
        status: room.status === 'tersedia' ? 'tersedia' as const : 'tentatif' as const,
        occupiedFrom: room.occupied_from, occupiedUntil: room.occupied_until, facilities: room.facilities ?? 'Belum dicantumkan.',
      }))
      const detailedBookings = (bookingDetailsResult.data ?? []).map((booking) => ({
        id: booking.id, roomId: booking.room_id, date: booking.booking_date,
        start: String(booking.start_time).slice(0, 5), end: String(booking.end_time).slice(0, 5),
        requestedCapacity: booking.requested_capacity, purpose: booking.purpose,
        letterId: booking.letter_path, letterName: booking.letter_path.split('/').at(-1)?.replace(/^[a-f0-9-]+__/, '') ?? 'Surat pengajuan.pdf',
        requester: booking.requested_by === authUser!.id ? profileRow.full_name : 'Guru / Wali Kelas',
        requesterId: booking.requested_by, createdAt: booking.created_at, status: booking.status as BookingStatus,
        rejectionNote: booking.sarpras_note ?? booking.decision_note,
      }))
      const detailedIds = new Set(detailedBookings.map((booking) => booking.id))
      const scheduleBookings = (bookingSlotsResult.data ?? []).filter((booking) => !detailedIds.has(booking.id)).map((booking) => ({
        id: booking.id, roomId: booking.room_id, date: booking.booking_date,
        start: String(booking.start_time).slice(0, 5), end: String(booking.end_time).slice(0, 5),
        requestedCapacity: booking.requested_capacity, purpose: '', letterId: null, letterName: null,
        requester: 'Guru / Wali Kelas', requesterId: null, createdAt: '', status: booking.status as BookingStatus, rejectionNote: null,
      }))
      const bookings = [...detailedBookings, ...scheduleBookings].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
      const tickets = await Promise.all((ticketsResult.data ?? []).map(async (ticket) => {
        const photoUrl = ticket.photo_url
          ? (await supabase!.storage.from('damage-photos').createSignedUrl(ticket.photo_url, 3600)).data?.signedUrl ?? null
          : null
        return {
          id: ticket.id, number: ticket.ticket_number, title: ticket.title, category: ticket.category,
          equipment: ticket.equipment, location: ticket.location, description: ticket.description,
          photoName: ticket.photo_url ? 'Foto terlampir' : null, photoData: photoUrl,
          createdAt: ticket.created_at, status: ticket.status as TicketStatus, rejectionNote: ticket.decision_note ?? null,
        }
      }))
      const accounts = (profilesResult.data ?? []).map((account) => ({
        id: account.id, fullName: account.full_name, email: account.email,
        role: (account.approval_status !== 'approved' ? account.requested_role : account.role) as Role,
        requestedRole: account.requested_role as Role,
        approvalStatus: account.approval_status as AccountApprovalStatus, isActive: account.is_active,
        createdAt: account.created_at,
      }))
      setData({ role, rooms, bookings, tickets, accounts })
      setBookingRoom((selected) => rooms.some((room) => room.id === selected) ? selected : rooms[0]?.id ?? '')
      setReady(true)
    }
    loadFromSupabase().catch((error: unknown) => {
      if (!active) return
      setConnectionError(error instanceof Error ? error.message : 'Terjadi kesalahan saat memuat data Supabase.')
      setReady(true)
    })
    return () => { active = false }
  }, [authUser, authLoading])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    if (!openDocument) return
    const dialog = document.querySelector('.document-dialog')
    const focusable = Array.from(dialog?.querySelectorAll<HTMLElement>('button, iframe, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])
    focusable[0]?.focus()

    function keepFocusInDialog(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenDocument(null)
        return
      }
      if (event.key !== 'Tab' || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', keepFocusInDialog)
    return () => {
      window.removeEventListener('keydown', keepFocusInDialog)
      previousFocus.current?.focus()
      previousFocus.current = null
    }
  }, [openDocument])

  useEffect(() => () => {
    if (openDocument) URL.revokeObjectURL(openDocument.url)
  }, [openDocument])

  const role = data.role
  const navItems = NAVIGATION.filter((item) => item.roles.includes(role))
  const currentView = NAVIGATION.find((item) => item.id === view)
  const activeRoom = data.rooms.find((room) => room.id === bookingRoom)
  const bookableRooms = data.rooms.filter((room) => room.status === 'tersedia')
  const currentTickets = data.tickets
  const currentBookings = data.bookings

  const pendingTickets = data.tickets.filter((ticket) => !['selesai', 'ditolak'].includes(ticket.status))
  const pendingBookings = data.bookings.filter((booking) => ['diajukan_sarpras', 'menunggu_kepsek'].includes(booking.status))

  const slotRows = useMemo(() => {
    const rows: { start: string; end: string; blocked: boolean; manualOccupancy: boolean }[] = []
    const activeBookings = data.bookings.filter((booking) =>
      booking.roomId === bookingRoom && booking.date === bookingDate && ACTIVE_BOOKING_STATUSES.has(booking.status),
    )
    for (let minute = SCHOOL_START_MINUTE; minute < SCHOOL_END_MINUTE; minute += SCHEDULE_STEP_MINUTES) {
      const endMinute = Math.min(minute + SCHEDULE_STEP_MINUTES, SCHOOL_END_MINUTE)
      const start = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
      const end = `${String(Math.floor(endMinute / 60)).padStart(2, '0')}:${String(endMinute % 60).padStart(2, '0')}`
      const selectedRoom = data.rooms.find((room) => room.id === bookingRoom)
      const manualOccupancy = selectedRoom ? roomOccupancyOverlaps(selectedRoom, bookingDate, start, end) : false
      const booked = activeBookings.some((booking) => overlaps(start, end, booking.start, booking.end))
      rows.push({ start, end, blocked: manualOccupancy || booked, manualOccupancy })
    }
    return rows
  }, [data.bookings, data.rooms, bookingDate, bookingRoom])

  function announce(message: string) {
    setNotice(message)
  }

  function changeView(nextView: View) {
    setView(nextView)
    setMobileNavOpen(false)
  }

  async function signOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    setData({ role: 'guru', rooms: [], tickets: [], bookings: [], accounts: [] })
    setView('dashboard')
  }

  async function updateAccount(accountId: string, role: Role) {
    if (!supabase) return
    const { error } = await supabase.from('profiles').update({ role, updated_at: new Date().toISOString() }).eq('id', accountId)
    if (error) {
      announce(`Peran akun gagal diperbarui: ${error.message}`)
      return
    }
    setData((previous) => ({ ...previous, accounts: previous.accounts.map((account) => account.id === accountId ? { ...account, role } : account) }))
    announce('Peran akun diperbarui di Supabase.')
  }

  async function setAccountApproval(accountId: string, approvalStatus: AccountApprovalStatus) {
    if (!supabase) return
    const account = data.accounts.find((item) => item.id === accountId)
    if (!account) return
    const values = approvalStatus === 'approved'
      ? { role: account.requestedRole, approval_status: approvalStatus, is_active: true, updated_at: new Date().toISOString() }
      : { approval_status: approvalStatus, is_active: false, updated_at: new Date().toISOString() }
    const { error } = await supabase.from('profiles').update(values).eq('id', accountId)
    if (error) {
      announce(`Persetujuan akun gagal disimpan: ${error.message}`)
      return
    }
    setData((previous) => ({ ...previous, accounts: previous.accounts.map((item) => item.id === accountId ? { ...item, role: approvalStatus === 'approved' ? item.requestedRole : item.role, approvalStatus, isActive: approvalStatus === 'approved' } : item) }))
    announce(approvalStatus === 'approved' ? 'Akun disetujui dan diaktifkan.' : 'Pendaftaran akun ditolak.')
  }

  async function toggleAccount(accountId: string) {
    if (!supabase) return
    const account = data.accounts.find((item) => item.id === accountId)
    if (!account || account.approvalStatus !== 'approved') return
    const isActive = !account.isActive
    const { error } = await supabase.from('profiles').update({ is_active: isActive, updated_at: new Date().toISOString() }).eq('id', accountId)
    if (error) {
      announce(`Status akun gagal diperbarui: ${error.message}`)
      return
    }
    setData((previous) => ({ ...previous, accounts: previous.accounts.map((item) => item.id === accountId ? { ...item, isActive } : item) }))
    announce('Status aktif akun diperbarui di Supabase.')
  }

  async function requestAccountDeletion(accountId: string): Promise<string | null> {
    if (!supabase) return 'Koneksi Supabase belum tersedia.'
    const { error } = await supabase.functions.invoke('super-action', { body: { userId: accountId } })
    if (!error) return null

    let message = error.message
    if ('context' in error && error.context instanceof Response) {
      const body: unknown = await error.context.clone().json().catch(() => null)
      if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
        message = body.message
      }
    }
    if (message.includes('Failed to send') && message.includes('Edge Function')) {
      return 'Tidak dapat menghubungi fungsi penghapusan akun. Pastikan fungsi super-action sudah aktif di Supabase.'
    }
    return message
  }

  async function rejectAccount(accountId: string) {
    if (!profile) return
    const account = data.accounts.find((item) => item.id === accountId)
    if (!account) return
    if (account.id === profile.id || account.role === 'admin') {
      announce('Akun Admin tidak dapat dihapus dari menu ini.')
      return
    }
    if (!window.confirm(`Tolak pendaftaran ${account.fullName}? Akun dan profilnya akan dihapus permanen.`)) return

    const error = await requestAccountDeletion(accountId)
    if (error) {
      announce(`Pendaftaran tidak ditolak karena akun gagal dihapus: ${error}`)
      return
    }
    setData((previous) => ({ ...previous, accounts: previous.accounts.filter((item) => item.id !== accountId) }))
    announce(`Pendaftaran ${account.fullName} ditolak dan akun dihapus permanen.`)
  }

  async function deleteAccount(accountId: string) {
    if (!profile) return
    const account = data.accounts.find((item) => item.id === accountId)
    if (!account) return
    if (account.id === profile.id || account.role === 'admin') {
      announce('Akun Admin tidak dapat dihapus dari menu ini.')
      return
    }
    if (!window.confirm(`Hapus akun ${account.fullName} (${account.email}) secara permanen? Akun dengan riwayat booking atau laporan tidak dapat dihapus.`)) return

    const error = await requestAccountDeletion(accountId)
    if (error) {
      announce(`Akun gagal dihapus: ${error}`)
      return
    }

    setData((previous) => ({ ...previous, accounts: previous.accounts.filter((item) => item.id !== accountId) }))
    announce(`Akun ${account.fullName} berhasil dihapus.`)
  }

  async function submitTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const title = String(form.get('title') ?? '').trim()
    const equipment = String(form.get('equipment') ?? '').trim()
    const location = String(form.get('location') ?? '').trim()
    const description = String(form.get('description') ?? '').trim()
    const category = String(form.get('category') ?? '')
    if (!supabase || !authUser) return
    if (!title || !equipment || !location || !description) {
      announce('Lengkapi semua kolom wajib sebelum mengirim laporan.')
      return
    }

    const ticketId = newId()
    let photoPath: string | null = null
    if (photo) {
      const extension = photo.name.split('.').pop()?.toLowerCase() || 'jpg'
      photoPath = `${authUser.id}/${ticketId}.${extension}`
      const upload = await supabase.storage.from('damage-photos').upload(photoPath, photo.file, { upsert: false })
      if (upload.error) {
        announce(`Foto gagal diunggah. Jalankan migration penyimpanan foto: ${upload.error.message}`)
        return
      }
    }
    const { data: saved, error } = await supabase.from('damage_tickets').insert({
      reported_by: authUser.id, title, category, equipment, location, description, photo_url: photoPath,
    }).select('*').single()
    if (error) {
      if (photoPath) await supabase.storage.from('damage-photos').remove([photoPath])
      announce(`Laporan gagal disimpan: ${error.message}`)
      return
    }
    let photoUrl: string | null = null
    if (photoPath) photoUrl = (await supabase.storage.from('damage-photos').createSignedUrl(photoPath, 3600)).data?.signedUrl ?? null
    const ticket: Ticket = {
      id: saved.id, number: saved.ticket_number, title: saved.title, category: saved.category,
      equipment: saved.equipment, location: saved.location, description: saved.description,
      photoName: photo ? 'Foto terlampir' : null, photoData: photoUrl,
      createdAt: saved.created_at, status: saved.status as TicketStatus,
    }
    setData((previous) => ({ ...previous, tickets: [ticket, ...previous.tickets] }))
    formElement.reset()
    setPhoto(null)
    setView('tickets')
    announce('Laporan tersimpan di Supabase dan dikirim ke Wakasek Sarpras.')
  }

  async function updateTicket(ticketId: string, status: TicketStatus) {
    if (!supabase || !profile) return
    let note: string | null = null
    if (status === 'ditolak') {
      note = window.prompt('Tuliskan alasan penolakan (wajib):')?.trim() ?? ''
      if (!note) {
        announce('Penolakan dibatalkan. Alasan penolakan wajib diisi.')
        return
      }
    }
    const values: Record<string, string> = { status, updated_at: new Date().toISOString() }
    if (note) values[profile.role === 'sarpras' ? 'sarpras_note' : 'decision_note'] = note
    if (profile.role === 'sarpras') {
      values.verified_by = profile.id
      if (status === 'verifikasi_lapangan') values.field_verified_at = new Date().toISOString()
    } else if (profile.role === 'kepsek') {
      values.decided_by = profile.id
    }
    if (status === 'selesai') values.completed_at = new Date().toISOString()
    const { error } = await supabase.from('damage_tickets').update(values).eq('id', ticketId)
    if (error) {
      announce(`Status laporan gagal diperbarui: ${error.message}`)
      return
    }
    setData((previous) => ({ ...previous, tickets: previous.tickets.map((ticket) => ticket.id === ticketId ? { ...ticket, status, rejectionNote: note ?? ticket.rejectionNote } : ticket) }))
    announce(`Status laporan disimpan: ${TICKET_LABELS[status]}.`)
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const purpose = String(form.get('purpose') ?? '').trim()
    const start = String(form.get('start') ?? '')
    const end = String(form.get('end') ?? '')
    const requestedCapacity = Number(form.get('requestedCapacity'))
    const room = data.rooms.find((item) => item.id === bookingRoom)

    if (!room || room.status !== 'tersedia') {
      announce('Pilih ruangan yang statusnya sudah dikonfirmasi Admin.')
      return
    }
    if (!bookingDate || !dateIsWeekday(bookingDate)) {
      announce('Booking hanya dapat diajukan untuk hari Senin sampai Jumat.')
      return
    }
    if (!start || !end || timeToMinutes(start) < SCHOOL_START_MINUTE || timeToMinutes(end) > SCHOOL_END_MINUTE || timeToMinutes(start) >= timeToMinutes(end)) {
      announce('Pilih waktu yang benar di antara pukul 07.00 sampai 16.00.')
      return
    }
    if (bookingDate === todayLocal() && new Date(`${bookingDate}T${start}:00`).getTime() <= Date.now()) {
      announce('Pilih waktu yang belum lewat untuk hari ini.')
      return
    }
    if (!purpose) {
      announce('Isi keperluan penggunaan ruangan.')
      return
    }
    if (!Number.isInteger(requestedCapacity) || requestedCapacity < 1 || requestedCapacity > room.capacity) {
      announce(`Masukkan kapasitas antara 1 sampai ${room.capacity} orang.`)
      return
    }
    if (roomOccupancyOverlaps(room, bookingDate, start, end)) {
      announce(`Ruangan terpakai sampai ${formatLocalDateTime(room.occupiedUntil ?? '')}. Pilih jadwal setelah waktu tersebut.`)
      return
    }
    const conflictingBooking = findBookingConflict(data.bookings, bookingRoom, bookingDate, start, end)
    if (conflictingBooking) {
      announce(`Jadwal bertabrakan dengan booking ${conflictingBooking.start} sampai ${conflictingBooking.end}. Pilih waktu lain.`)
      return
    }
    if (!bookingLetter) {
      announce('Lampirkan surat pengajuan dalam format PDF.')
      return
    }

    if (!supabase || !authUser || !profile) return
    const bookingId = newId()
    const safeFileName = bookingLetter.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const letterPath = `${authUser.id}/${bookingId}__${safeFileName}`
    setBookingSubmitting(true)
    const upload = await supabase.storage.from('booking-letters').upload(letterPath, bookingLetter, {
      contentType: 'application/pdf', upsert: false,
    })
    if (upload.error) {
      setBookingSubmitting(false)
      announce(`Surat PDF gagal diunggah ke Supabase: ${upload.error.message}`)
      return
    }
    const { data: saved, error } = await supabase.from('room_bookings').insert({
      id: bookingId, room_id: bookingRoom, requested_by: authUser.id, booking_date: bookingDate,
      start_time: start, end_time: end, requested_capacity: requestedCapacity, purpose, letter_path: letterPath,
    }).select('*').single()
    if (error) {
      await supabase.storage.from('booking-letters').remove([letterPath])
      setBookingSubmitting(false)
      announce(`Booking gagal disimpan: ${error.message}`)
      return
    }
    setBookingSubmitting(false)
    const booking: Booking = {
      id: saved.id, roomId: saved.room_id, date: saved.booking_date,
      start: String(saved.start_time).slice(0, 5), end: String(saved.end_time).slice(0, 5),
      requestedCapacity: saved.requested_capacity, purpose: saved.purpose,
      letterId: saved.letter_path, letterName: bookingLetter.name,
      requester: profile.fullName, requesterId: authUser.id,
      createdAt: saved.created_at, status: saved.status as BookingStatus,
    }
    setData((previous) => ({ ...previous, bookings: [booking, ...previous.bookings] }))
    formElement.reset()
    setBookingStart('09:00')
    setBookingEnd('10:00')
    setBookingCapacity('1')
    setBookingLetter(null)
    announce('Booking dan surat tersimpan di Supabase untuk ditinjau Sarpras.')
  }

  async function readBookingLetter(booking: Booking) {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!supabase || !booking.letterId || !booking.letterName) {
      announce('Path surat PDF tidak tersedia di Supabase.')
      return
    }
    const { data, error } = await supabase.storage.from('booking-letters').download(booking.letterId)
    if (error || !data) {
      announce(`Surat PDF tidak dapat diunduh: ${error?.message ?? 'file tidak ditemukan'}`)
      return
    }
    setOpenDocument({ name: booking.letterName, url: URL.createObjectURL(data) })
  }

  async function updateBooking(bookingId: string, status: BookingStatus) {
    if (!supabase || !profile) return
    let note: string | null = null
    if (status === 'ditolak') {
      note = window.prompt('Tuliskan alasan penolakan (wajib):')?.trim() ?? ''
      if (!note) {
        announce('Penolakan dibatalkan. Alasan penolakan wajib diisi.')
        return
      }
    }
    const values: Record<string, string | null> = { status, updated_at: new Date().toISOString() }
    if (note) values[profile.role === 'sarpras' ? 'sarpras_note' : 'decision_note'] = note
    if (profile.role === 'sarpras' && status === 'menunggu_kepsek') values.recommended_by = profile.id
    if (profile.role === 'kepsek') values.decided_by = profile.id
    const { error } = await supabase.from('room_bookings').update(values).eq('id', bookingId)
    if (error) {
      announce(`Status booking gagal disimpan: ${error.message}`)
      return
    }
    setData((previous) => ({ ...previous, bookings: previous.bookings.map((booking) => booking.id === bookingId ? { ...booking, status, rejectionNote: note ?? booking.rejectionNote } : booking) }))
    announce(`Status booking tersimpan di Supabase: ${BOOKING_LABELS[status]}.`)
  }

  async function toggleRoom(roomId: string) {
    if (!supabase) return
    const room = data.rooms.find((item) => item.id === roomId)
    if (!room) return
    const status = room.status === 'tersedia' ? 'tentatif' : 'tersedia'
    const { error } = await supabase.from('rooms').update({ status, updated_at: new Date().toISOString() }).eq('id', roomId)
    if (error) {
      announce(`Status ruangan gagal disimpan: ${error.message}`)
      return
    }
    setData((previous) => ({ ...previous, rooms: previous.rooms.map((item) => item.id === roomId ? { ...item, status } : item) }))
    announce('Status ruangan diperbarui di Supabase.')
  }

  async function setRoomOccupancy(roomId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const occupiedUntil = String(form.get('occupiedUntil') ?? '').trim()
    if (!occupiedUntil) {
      announce('Pilih tanggal dan jam selesai pemakaian.')
      return
    }
    const until = new Date(occupiedUntil)
    if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) {
      announce('Waktu selesai pemakaian harus setelah waktu sekarang.')
      return
    }
    const occupiedFrom = toLocalDateTime(new Date())
    const occupiedFromTime = new Date(occupiedFrom).getTime()
    const conflictingBooking = data.bookings.find((booking) =>
      booking.roomId === roomId &&
      ['diajukan_sarpras', 'menunggu_kepsek', 'disetujui'].includes(booking.status) &&
      new Date(`${booking.date}T${booking.start}:00`).getTime() < until.getTime() &&
      new Date(`${booking.date}T${booking.end}:00`).getTime() > occupiedFromTime,
    )
    if (conflictingBooking) {
      announce(`Tidak dapat menyimpan. Jadwal bertabrakan dengan booking ${formatDate(conflictingBooking.date)} pukul ${conflictingBooking.start} sampai ${conflictingBooking.end}.`)
      return
    }
    if (!supabase) return
    const { error } = await supabase.from('rooms').update({ occupied_from: occupiedFrom, occupied_until: occupiedUntil, updated_at: new Date().toISOString() }).eq('id', roomId)
    if (error) {
      announce(`Waktu pemakaian gagal disimpan: ${error.message}`)
      return
    }
    setData((previous) => ({ ...previous, rooms: previous.rooms.map((room) => room.id === roomId ? { ...room, occupiedFrom, occupiedUntil } : room) }))
    announce(`Waktu pemakaian sampai ${formatLocalDateTime(occupiedUntil)} tersimpan di Supabase.`)
  }

  async function clearRoomOccupancy(roomId: string) {
    if (!supabase) return
    const { error } = await supabase.from('rooms').update({ occupied_from: null, occupied_until: null, updated_at: new Date().toISOString() }).eq('id', roomId)
    if (error) {
      announce(`Jadwal pemakaian gagal dihapus: ${error.message}`)
      return
    }
    setData((previous) => ({ ...previous, rooms: previous.rooms.map((room) => room.id === roomId ? { ...room, occupiedFrom: null, occupiedUntil: null } : room) }))
    announce('Jadwal pemakaian ruangan dihapus dari Supabase.')
  }

  async function deleteRoom(roomId: string) {
    if (!supabase) return
    const room = data.rooms.find((item) => item.id === roomId)
    if (!room) return
    if (!window.confirm(`Hapus ruangan ${room.name} (${room.code})? Tindakan ini tidak dapat dibatalkan.`)) return

    const { error } = await supabase.from('rooms').delete().eq('id', roomId)
    if (error) {
      if (error.code === '23503') {
        announce(`Ruangan ${room.name} tidak dapat dihapus karena masih memiliki riwayat booking. Tandai tentatif agar tidak dipilih untuk booking baru.`)
      } else {
        announce(`Ruangan gagal dihapus: ${error.message}`)
      }
      return
    }

    setData((previous) => ({ ...previous, rooms: previous.rooms.filter((item) => item.id !== roomId) }))
    setBookingRoom((current) => current === roomId ? '' : current)
    announce(`Ruangan ${room.name} berhasil dihapus.`)
  }

  async function addRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const code = String(form.get('code') ?? '').trim()
    const location = String(form.get('location') ?? '').trim()
    const capacity = Number(form.get('capacity'))
    if (!name || !code || !location || capacity < 1) {
      announce('Lengkapi nama, kode, lokasi, dan kapasitas ruangan.')
      return
    }
    if (!supabase) return
    const { data: saved, error } = await supabase.from('rooms').insert({ code, name, location, capacity, status: 'tentatif', facilities: null }).select('*').single()
    if (error) {
      announce(`Ruangan gagal ditambahkan: ${error.message}`)
      return
    }
    const room: Room = {
      id: saved.id, code: saved.code, name: saved.name, location: saved.location, capacity: saved.capacity,
      status: 'tentatif', occupiedFrom: saved.occupied_from, occupiedUntil: saved.occupied_until, facilities: saved.facilities ?? 'Belum dicantumkan.',
    }
    setData((previous) => ({ ...previous, rooms: [...previous.rooms, room] }))
    event.currentTarget.reset()
    announce('Ruangan ditambahkan di Supabase dengan status tentatif.')
  }

  function handleBookingLetter(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    if (!file) {
      setBookingLetter(null)
      return
    }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      announce('Surat pengajuan harus berformat PDF.')
      event.target.value = ''
      setBookingLetter(null)
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      announce('Ukuran surat PDF maksimal 8 MB.')
      event.target.value = ''
      setBookingLetter(null)
      return
    }
    setBookingLetter(file)
  }

  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      setPhoto(null)
      return
    }
    if (!file.type.startsWith('image/')) {
      setPhoto(null)
      announce('Pilih file gambar untuk dokumentasi kerusakan.')
      event.target.value = ''
      return
    }
    if (file.size > 3 * 1024 * 1024) {
      setPhoto(null)
      announce('Ukuran foto maksimal 3 MB.')
      event.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => setPhoto({ name: file.name, data: String(reader.result), file })
    reader.readAsDataURL(file)
  }

  const heading = currentView?.label ?? 'Ringkasan'
  const isReviewer = role === 'sarpras' || role === 'kepsek'

  if (authLoading) return <div className="loading-state">Memeriksa sesi Supabase...</div>
  if (!authUser) return <AuthView configurationError={connectionError} />
  if (!ready) return <div className="loading-state">Memuat data dari Supabase...</div>
  if (!profile) return <main className="auth-page"><section className="auth-panel"><h1>Koneksi data bermasalah</h1><p className="auth-message auth-error" role="alert">{connectionError || 'Profil akun tidak ditemukan.'}</p><button className="button button-primary" onClick={signOut}>Keluar</button></section></main>
  if (profile.approvalStatus !== 'approved' || !profile.isActive) return (
    <main className="auth-page"><section className="auth-panel"><div className="auth-brand"><BrandLogo className="brand-logo auth-brand-logo" /><div><strong>SIRANA</strong><span>Habibi Bina Cendikia</span></div></div><h1>{profile.approvalStatus === 'rejected' ? 'Pendaftaran ditolak' : 'Menunggu persetujuan'}</h1><p className="auth-description">{profile.approvalStatus === 'rejected' ? 'Pendaftaran belum disetujui. Hubungi Admin sekolah untuk informasi lebih lanjut.' : `Halo ${profile.fullName}, akun Anda menunggu persetujuan Admin sebelum dapat digunakan.`}</p><button className="button button-primary" onClick={signOut}>Keluar</button></section></main>
  )

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <BrandLogo className="brand-logo sidebar-brand-logo" />
          <div className="brand-copy">
            <span className="brand-name">SIRANA</span>
            <span className="brand-school">Habibi Bina Cendikia</span>
          </div>
          <button className="mobile-close icon-button" onClick={() => setMobileNavOpen(false)} aria-label="Tutup menu">
            <X size={19} />
          </button>
        </div>

        <div className="sidebar-label">MENU UTAMA</div>
        <nav className="nav-list" aria-label="Navigasi utama">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${view === id ? 'nav-item-active' : ''}`} onClick={() => changeView(id)}>
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
              {id === 'reviews' && pendingTickets.length + pendingBookings.length > 0 && (
                <span className="nav-count">{pendingTickets.length + pendingBookings.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="help-box">
            <CircleHelp size={17} />
            <div>
              <strong>Butuh bantuan?</strong>
              <span>Hubungi Wakasek Sarpras.</span>
            </div>
          </div>
          <div className="prototype-note">Data tersambung ke Supabase</div>
        </div>
      </aside>

      {mobileNavOpen && <button className="mobile-scrim" onClick={() => setMobileNavOpen(false)} aria-label="Tutup navigasi" />}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu icon-button" onClick={() => setMobileNavOpen(true)} aria-label="Buka menu">
              <Menu size={20} />
            </button>
            <div>
              <div className="eyebrow">LAYANAN SARANA DAN PRASARANA</div>
              <h1>{heading}</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <span className="role-chip"><ShieldCheck size={15} />{roleLabel(role)}</span>
            <span className="signed-in-email">{authUser.email}</span>
            <button className="button button-quiet signout-button" onClick={signOut}>Keluar</button>
          </div>
        </header>

        <div className="content-wrap">
          {connectionError && <p className="auth-message auth-error" role="alert">{connectionError}</p>}
          {view === 'dashboard' && (
                <DashboardView
                  role={role}
                  tickets={data.tickets}
                  bookings={currentBookings}
                  rooms={data.rooms}
                  accounts={data.accounts}
                  now={now}
                  pendingTickets={pendingTickets.length}
                  pendingBookings={pendingBookings.length}
                  onNavigate={changeView}
                />
              )}
              {view === 'tickets' && (
                <TicketsView
                  role={role}
                  tickets={currentTickets}
                  onNavigate={changeView}
                  onUpdate={updateTicket}
                />
              )}
              {view === 'new-ticket' && role === 'guru' && (
                <NewTicketView photo={photo} onPhotoChange={handlePhoto} onSubmit={submitTicket} />
              )}
              {view === 'booking' && (
                <BookingView
                  role={role}
                  requesterId={authUser.id}
                  rooms={data.rooms}
                  bookings={currentBookings}
                  bookingDate={bookingDate}
                  bookingRoom={bookingRoom}
                  bookingStart={bookingStart}
                  bookingEnd={bookingEnd}
                  bookingCapacity={bookingCapacity}
                  bookingLetter={bookingLetter}
                  bookingSubmitting={bookingSubmitting}
                  now={now}
                  slotRows={slotRows}
                  activeRoom={activeRoom}
                  bookableRooms={bookableRooms}
                  onDateChange={setBookingDate}
                  onRoomChange={setBookingRoom}
                  onStartChange={setBookingStart}
                  onEndChange={setBookingEnd}
                  onCapacityChange={setBookingCapacity}
                  onLetterChange={handleBookingLetter}
                  onSubmit={submitBooking}
                  onCancel={(id) => updateBooking(id, 'dibatalkan')}
                />
              )}
              {view === 'reviews' && isReviewer && (
                <ReviewView
                  role={role}
                  tickets={data.tickets}
                  bookings={data.bookings}
                  rooms={data.rooms}
                  onTicketUpdate={updateTicket}
                  onBookingUpdate={updateBooking}
                  onReadLetter={readBookingLetter}
                />
              )}
              {view === 'rooms' && role === 'admin' && (
                <RoomsView
                  rooms={data.rooms}
                  now={now}
                  onToggle={toggleRoom}
                  onAdd={addRoom}
                  onDelete={deleteRoom}
                  onSetOccupancy={setRoomOccupancy}
                  onClearOccupancy={clearRoomOccupancy}
                />
              )}
              {view === 'accounts' && role === 'admin' && (
                <AccountsView
                  accounts={data.accounts}
                  currentUserId={profile.id}
                  onChangeRole={updateAccount}
                  onApprove={(id) => setAccountApproval(id, 'approved')}
                  onReject={rejectAccount}
                  onToggle={toggleAccount}
                  onDelete={deleteAccount}
                />
              )}
        </div>
      </main>

      {openDocument && <div className="document-overlay" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpenDocument(null)
      }}>
        <section className="document-dialog" role="dialog" aria-modal="true" aria-label={`Surat pengajuan: ${openDocument.name}`}>
          <header><div><FileText size={18} /><strong>{openDocument.name}</strong></div><button className="icon-button" onClick={() => setOpenDocument(null)} aria-label="Tutup surat"><X size={18} /></button></header>
          <iframe src={openDocument.url} title={`Pratinjau ${openDocument.name}`} />
        </section>
      </div>}
      {notice && <div className="toast" role="status"><Check size={17} />{notice}</div>}
    </div>
  )
}

function DashboardView({
  role,
  tickets,
  bookings,
  rooms,
  accounts,
  now,
  pendingTickets,
  pendingBookings,
  onNavigate,
}: {
  role: Role
  tickets: Ticket[]
  bookings: Booking[]
  rooms: Room[]
  accounts: ManagedAccount[]
  now: number
  pendingTickets: number
  pendingBookings: number
  onNavigate: (view: View) => void
}) {
  const roleMessage: Record<Role, string> = {
    guru: 'Ajukan booking ruangan atau laporkan fasilitas yang perlu diperbaiki.',
    sarpras: 'Tinjau usulan masuk, lakukan verifikasi, lalu teruskan rekomendasi.',
    kepsek: 'Tinjau permintaan yang sudah direkomendasikan oleh Wakasek Sarpras.',
    admin: 'Kelola akun pengguna dan data ruangan sekolah.',
  }
  const visibleTickets = role === 'guru' ? tickets : tickets
  const availableRoomCount = rooms.filter((room) => room.status === 'tersedia').length

  return (
    <div className="page-stack">
      <section className="welcome-row">
        <div>
          <p className="date-line">SMP Habibi Bina Cendikia</p>
          <h2>Selamat datang</h2>
          <p className="welcome-copy">{roleMessage[role]}</p>
        </div>
        <span className="role-chip"><ShieldCheck size={15} />{roleLabel(role)}</span>
      </section>

      <section className="metric-grid" aria-label="Ringkasan aktivitas">
        <MetricCard label="Laporan kerusakan" value={visibleTickets.length} detail="Data Supabase sesuai hak akses" icon={ClipboardList} />
        <MetricCard label="Booking ruangan" value={bookings.length} detail="Permintaan pada role ini" icon={CalendarDays} />
        <MetricCard label="Ruangan bisa diajukan" value={availableRoomCount} detail="Berdasarkan status data awal" icon={Building2} />
        {role === 'sarpras' && <MetricCard label="Menunggu tinjauan" value={pendingTickets + pendingBookings} detail="Laporan dan booking" icon={Clock3} />}
        {role === 'kepsek' && <MetricCard label="Menunggu keputusan" value={pendingTickets + pendingBookings} detail="Usulan dari Wakasek Sarpras" icon={BookOpenCheck} />}
        {role === 'admin' && <MetricCard label="Data ruangan" value={rooms.length} detail="Termasuk ruangan tentatif" icon={Building2} />}
        {role === 'admin' && <MetricCard label="Profil pengguna" value={accounts.length} detail="Termasuk yang menunggu persetujuan" icon={Users} />}
      </section>

      {role === 'guru' ? (
        <section className="action-grid">
          <button className="action-card action-card-primary" onClick={() => onNavigate('new-ticket')}>
            <span className="action-icon"><FilePlus2 size={21} /></span>
            <span className="action-title">Laporkan kerusakan</span>
            <span className="action-description">Kirim laporan fasilitas beserta lokasi dan dokumentasi.</span>
            <span className="action-link">Buat laporan <ArrowRight size={15} /></span>
          </button>
          <button className="action-card" onClick={() => onNavigate('booking')}>
            <span className="action-icon action-icon-mint"><CalendarDays size={21} /></span>
            <span className="action-title">Booking ruangan</span>
            <span className="action-description">Periksa jadwal ruangan dan ajukan waktu penggunaan.</span>
            <span className="action-link">Lihat jadwal <ArrowRight size={15} /></span>
          </button>
        </section>
      ) : role === 'sarpras' ? (
        <section className="review-banner">
          <div className="review-banner-icon"><ClipboardCheck size={22} /></div>
          <div className="review-banner-copy">
            <h3>Daftar tinjauan Sarpras</h3>
            <p>Periksa usulan, verifikasi kondisi di lapangan, dan kirim rekomendasi ke Kepala Sekolah.</p>
          </div>
          <button className="button button-primary" onClick={() => onNavigate('reviews')}>Buka tinjauan <ArrowRight size={16} /></button>
        </section>
      ) : role === 'kepsek' ? (
        <section className="review-banner">
          <div className="review-banner-icon"><BookOpenCheck size={22} /></div>
          <div className="review-banner-copy">
            <h3>Persetujuan Kepala Sekolah</h3>
            <p>Permintaan yang tampil di sini sudah melewati rekomendasi Wakasek Sarpras.</p>
          </div>
          <button className="button button-primary" onClick={() => onNavigate('reviews')}>Lihat usulan <ArrowRight size={16} /></button>
        </section>
      ) : (
        <section className="review-banner">
          <div className="review-banner-icon"><Building2 size={22} /></div>
          <div className="review-banner-copy">
            <h3>Pengelolaan sekolah</h3>
            <p>Perbarui akun pengguna dan pastikan status ruangan sebelum booking dibuka.</p>
          </div>
          <div className="admin-banner-actions">
            <button className="button button-primary" onClick={() => onNavigate('accounts')}>Kelola akun <Users size={16} /></button>
            <button className="button button-quiet" onClick={() => onNavigate('rooms')}>Kelola ruangan <Building2 size={16} /></button>
          </div>
        </section>
      )}

      <section className="dashboard-lower">
        <div className="panel recent-panel">
          <div className="panel-heading">
            <div>
              <h3>Laporan terbaru</h3>
              <p>Perkembangan laporan kerusakan</p>
            </div>
            <button className="text-button" onClick={() => onNavigate('tickets')}>Lihat semua <ArrowRight size={14} /></button>
          </div>
          {visibleTickets.length === 0 ? (
            <EmptyState icon={ClipboardList} title="Belum ada laporan" description="Laporan yang dibuat akan tampil di sini." />
          ) : (
            <div className="compact-list">
              {visibleTickets.slice(0, 4).map((ticket) => <TicketRow key={ticket.id} ticket={ticket} />)}
            </div>
          )}
        </div>

        <div className="panel room-panel">
          <div className="panel-heading">
            <div>
              <h3>Ruangan untuk booking</h3>
              <p>Jam penggunaan sekolah: Senin sampai Jumat, 07.00–16.00</p>
            </div>
          </div>
          {rooms.map((room) => {
                    const currentUse = currentRoomUse(room, bookings, now)
            const status = currentUse?.label ?? (room.status === 'tersedia' ? 'Tersedia' : 'Tentatif')
            return <div className="room-mini" key={room.id}>
              <div className="room-mini-icon"><Building2 size={17} /></div>
              <div className="room-mini-copy">
                <strong>{room.name}</strong>
                <span>{room.location} · Kapasitas {room.capacity} orang</span>
              </div>
              <span className={currentUse ? 'room-status room-status-pending' : room.status === 'tersedia' ? 'room-status room-status-open' : 'room-status room-status-pending'}>
                {status}
              </span>
            </div>
          })}
        </div>
      </section>
    </div>
  )
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string
  value: number
  detail: string
  icon: typeof LayoutDashboard
}) {
  return (
    <article className="metric-card">
      <div className="metric-card-top">
        <span>{label}</span>
        <Icon size={18} strokeWidth={1.8} />
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  )
}

function TicketsView({
  role,
  tickets,
  onNavigate,
  onUpdate,
}: {
  role: Role
  tickets: Ticket[]
  onNavigate: (view: View) => void
  onUpdate: (id: string, status: TicketStatus) => void
}) {
  const shown = role === 'guru' ? tickets : tickets
  const nextAction: Partial<Record<TicketStatus, { label: string; status: TicketStatus }>> = {
    diajukan: { label: 'Mulai verifikasi', status: 'verifikasi_sarpras' },
    verifikasi_sarpras: { label: 'Verifikasi lapangan', status: 'verifikasi_lapangan' },
    verifikasi_lapangan: { label: 'Kirim rekomendasi', status: 'menunggu_kepsek' },
    proses_perbaikan: { label: 'Tandai selesai', status: 'selesai' },
  }

  return (
    <div className="page-stack">
      <PageIntro
        title="Laporan kerusakan"
        description="Catat kerusakan fasilitas dan ikuti tahap pemeriksaannya sampai selesai."
        action={role === 'guru' ? <button className="button button-primary" onClick={() => onNavigate('new-ticket')}><Plus size={16} />Buat laporan</button> : undefined}
      />
      {shown.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Belum ada laporan kerusakan" description={role === 'guru' ? 'Buat laporan jika menemukan fasilitas yang perlu diperbaiki.' : 'Laporan yang dikirim Guru atau Wali Kelas akan tampil di sini.'} />
      ) : (
        <div className="ticket-list">
          {shown.map((ticket) => {
            const action = nextAction[ticket.status]
            const canProgress = role === 'sarpras' && action
            const canApprove = role === 'kepsek' && ticket.status === 'menunggu_kepsek'
            return (
              <article className="panel ticket-card" key={ticket.id}>
                <div className="ticket-card-main">
                  <div className="ticket-number-line"><span>{ticket.number}</span><span className={statusClass(ticket.status)}>{TICKET_LABELS[ticket.status]}</span></div>
                  <h3>{ticket.title}</h3>
                  <p>{ticket.equipment} · {ticket.location}</p>
                  <p className="ticket-description">{ticket.description}</p>
                  <div className="ticket-meta"><span>{ticket.category}</span><span>{formatShortDate(ticket.createdAt)}</span>{ticket.photoName && <span className="photo-label"><ImagePlus size={13} /> Foto terlampir</span>}</div>
                  {ticket.photoData && <Image className="ticket-photo" src={ticket.photoData} alt={`Dokumentasi ${ticket.equipment}`} width={220} height={150} unoptimized />}
                  {ticket.rejectionNote && <p className="rejection-note">Alasan penolakan: {ticket.rejectionNote}</p>}
                  <TicketProgress status={ticket.status} />
                </div>
                {(canProgress || canApprove) && (
                  <div className="ticket-actions">
                    {canProgress && <button className="button button-primary" onClick={() => onUpdate(ticket.id, action.status)}>{action.label}<ArrowRight size={15} /></button>}
                    {canApprove && <>
                      <button className="button button-primary" onClick={() => onUpdate(ticket.id, 'proses_perbaikan')}><Check size={15} />Setujui perbaikan</button>
                      <button className="button button-quiet" onClick={() => onUpdate(ticket.id, 'ditolak')}><X size={15} />Tolak</button>
                    </>}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TicketProgress({ status }: { status: TicketStatus }) {
  if (status === 'ditolak') return <div className="progress-note progress-rejected">Usulan tidak disetujui. Hubungi Wakasek Sarpras untuk mengetahui alasannya.</div>
  const currentIndex = TICKET_STEPS.indexOf(status)
  return (
    <div className="progress-track" aria-label={`Tahap laporan: ${TICKET_LABELS[status]}`}>
      {TICKET_STEPS.map((step, index) => (
        <div className={`progress-step ${index <= currentIndex ? 'progress-step-done' : ''}`} key={step}>
          <span className="progress-dot">{index < currentIndex ? <Check size={10} /> : index + 1}</span>
          <span>{TICKET_LABELS[step]}</span>
        </div>
      ))}
    </div>
  )
}

function NewTicketView({
  photo,
  onPhotoChange,
  onSubmit,
}: {
  photo: { name: string; data: string } | null
  onPhotoChange: (event: ChangeEvent<HTMLInputElement>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <div className="page-stack narrow-page">
      <PageIntro title="Buat laporan kerusakan" description="Berikan informasi yang cukup agar Wakasek Sarpras dapat memeriksa laporan." />
      <form className="panel form-panel" onSubmit={onSubmit}>
        <div className="form-grid">
          <label className="field field-full">
            <span>Jenis kerusakan <b>*</b></span>
            <select name="category" defaultValue="Fasilitas rusak" required>
              <option>AC mati</option>
              <option>Wi-Fi bermasalah</option>
              <option>Loker rusak</option>
              <option>Kursi atau meja rusak</option>
              <option>Atap bocor</option>
              <option>Pintu rusak</option>
              <option>Fasilitas rusak</option>
              <option>Lainnya</option>
            </select>
          </label>
          <label className="field">
            <span>Nama alat atau fasilitas <b>*</b></span>
            <input name="equipment" placeholder="Contoh: AC ruang guru" required />
          </label>
          <label className="field">
            <span>Lokasi <b>*</b></span>
            <input name="location" placeholder="Contoh: Gedung A, lantai 2" required />
          </label>
          <label className="field field-full">
            <span>Judul laporan <b>*</b></span>
            <input name="title" placeholder="Ringkas masalah yang ditemukan" required />
          </label>
          <label className="field field-full">
            <span>Deskripsi kerusakan <b>*</b></span>
            <textarea name="description" rows={5} placeholder="Jelaskan kondisi dan kapan masalah mulai terlihat." required />
          </label>
          <label className="field field-full">
            <span>Foto dokumentasi <small>Opsional, maksimal 3 MB</small></span>
            <span className="upload-control">
              <ImagePlus size={18} />
              <span>{photo ? photo.name : 'Pilih foto kerusakan'}</span>
              <input type="file" accept="image/*" onChange={onPhotoChange} />
            </span>
          </label>
          {photo && <Image className="form-photo-preview" src={photo.data} alt="Pratinjau dokumentasi kerusakan" width={220} height={150} unoptimized />}
        </div>
        <div className="form-note"><CircleHelp size={16} />Laporan akan diteruskan kepada Wakasek Sarpras untuk diverifikasi.</div>
        <div className="form-footer"><span>Kolom bertanda * wajib diisi.</span><button className="button button-primary" type="submit"><FilePlus2 size={16} />Kirim laporan</button></div>
      </form>
    </div>
  )
}

function BookingView({
  role,
  requesterId,
  rooms,
  bookings,

  bookingDate,
  bookingRoom,
  bookingStart,
  bookingEnd,
  bookingCapacity,
  bookingLetter,
  bookingSubmitting,
  now,
  slotRows,
  activeRoom,
  bookableRooms,
  onDateChange,
  onRoomChange,
  onStartChange,
  onEndChange,
  onCapacityChange,
  onLetterChange,
  onSubmit,
  onCancel,
}: {
  role: Role
  requesterId: string
  rooms: Room[]
  bookings: Booking[]
  bookingDate: string
  bookingRoom: string
  bookingStart: string
  bookingEnd: string
  bookingCapacity: string
  bookingLetter: File | null
  bookingSubmitting: boolean
  now: number
  slotRows: { start: string; end: string; blocked: boolean; manualOccupancy: boolean }[]
  activeRoom: Room | undefined
  bookableRooms: Room[]
  onDateChange: (value: string) => void
  onRoomChange: (value: string) => void
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
  onCapacityChange: (value: string) => void
  onLetterChange: (event: ChangeEvent<HTMLInputElement>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onCancel: (id: string) => void
}) {
  const canRequest = role === 'guru'
  const userBookings = (canRequest ? bookings.filter((booking) => booking.requesterId === requesterId) : bookings)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
  const displayRooms = rooms
  const selectedCapacity = Number(bookingCapacity) || 0
  const capacityFits = selectedCapacity > 0 && selectedCapacity <= (activeRoom?.capacity ?? 0)
  const bookingConflict = activeRoom
    ? findBookingConflict(bookings, activeRoom.id, bookingDate, bookingStart, bookingEnd)
    : undefined
  const reservationQueue = bookings
    .filter((booking) => booking.roomId === bookingRoom && booking.date === bookingDate && ACTIVE_BOOKING_STATUSES.has(booking.status))
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))
  const visibleReservationQueue = reservationQueue.filter((booking) =>
    booking.date !== todayLocal() || booking.status !== 'disetujui' ||
    new Date(`${booking.date}T${booking.end}:00`).getTime() > now,
  )
  const manualOccupancyActive = Boolean(activeRoom?.occupiedFrom && activeRoom.occupiedUntil &&
    new Date(activeRoom.occupiedFrom).getTime() <= now && new Date(activeRoom.occupiedUntil).getTime() > now)
  const manualOccupancyTouchesDate = Boolean(activeRoom?.occupiedFrom && activeRoom.occupiedUntil &&
    activeRoom.occupiedFrom.slice(0, 10) <= bookingDate && activeRoom.occupiedUntil.slice(0, 10) >= bookingDate)
  const manualOccupancyConflict = Boolean(activeRoom && roomOccupancyOverlaps(activeRoom, bookingDate, bookingStart, bookingEnd))
  const selectedTimePassed = now > 0 && bookingDate === todayLocal() &&
    new Date(`${bookingDate}T${bookingStart}:00`).getTime() <= now

  return (
    <div className="page-stack">
      <PageIntro title="Booking ruangan" description="Pilih ruangan dan waktu yang tersedia. Permintaan akan direkomendasikan Wakasek Sarpras sebelum diputuskan Kepala Sekolah." />
      <div className="booking-layout">
        <section className="panel booking-form-panel">
          <div className="panel-heading panel-heading-spaced">
            <div><h3>Ajukan penggunaan ruangan</h3><p>Jadwal operasional sekolah: Senin sampai Jumat, 07.00–16.00.</p></div>
            <span className="panel-icon"><CalendarDays size={19} /></span>
          </div>
          {canRequest ? (
            <form className="booking-form" onSubmit={onSubmit}>
              <label className="field">
                <span>Ruangan</span>
                <select value={bookingRoom} onChange={(event) => onRoomChange(event.target.value)}>
                  {bookableRooms.map((room) => <option value={room.id} key={room.id}>{room.name}</option>)}
                  {bookableRooms.length === 0 && <option value="">Belum ada ruangan tersedia</option>}
                </select>
              </label>
              <label className="field">
                <span>Tanggal penggunaan</span>
                <input type="date" value={bookingDate} min={todayLocal()} onChange={(event) => onDateChange(event.target.value)} required />
              </label>
              <div className="field-row">
                <label className="field">
                  <span>Mulai</span>
                  <input type="time" name="start" value={bookingStart} step={60} onChange={(event) => onStartChange(event.target.value)} required />
                </label>
                <label className="field">
                  <span>Selesai</span>
                  <input type="time" name="end" value={bookingEnd} step={60} onChange={(event) => onEndChange(event.target.value)} required />
                </label>
              </div>
              <label className="field">
                <span>Kapasitas yang dibutuhkan</span>
                <input name="requestedCapacity" type="number" min="1" max={activeRoom?.capacity ?? undefined} value={bookingCapacity} onChange={(event) => onCapacityChange(event.target.value)} required />
                <small>Kapasitas maksimal ruangan {activeRoom?.capacity ?? 0} orang.</small>
              </label>
              <label className="field">
                <span>Keperluan</span>
                <textarea name="purpose" rows={3} placeholder="Tuliskan kegiatan dan unit pemohon." required />
              </label>
              <label className="field">
                <span>Surat pengajuan <b>*</b><small>PDF, maksimal 8 MB</small></span>
                <span className="upload-control"><Upload size={17} /><span>{bookingLetter?.name ?? 'Pilih surat pengajuan PDF'}</span><input aria-label="Unggah surat pengajuan PDF" type="file" accept="application/pdf,.pdf" onChange={onLetterChange} required /></span>
              </label>
              <div className="form-note"><ShieldCheck size={16} />Surat PDF disimpan privat di Supabase dan hanya dapat dibaca pengaju serta reviewer yang berwenang.</div>
              <div className="schedule-footnote">Satu ruangan hanya dapat dipakai satu booking pada satu waktu. Booking yang masih ditinjau juga menahan jadwal. Pilih waktu per menit, booking berikutnya bisa dimulai setelah booking sebelumnya selesai.</div>
              <button className="button button-primary button-wide" type="submit" disabled={!activeRoom || activeRoom.status !== 'tersedia' || !capacityFits || selectedTimePassed || manualOccupancyConflict || Boolean(bookingConflict) || bookingSubmitting}><CalendarDays size={16} />{bookingSubmitting ? 'Menyimpan surat…' : 'Ajukan booking'}</button>
            </form>
          ) : (
            <div className="notice-card"><ShieldCheck size={19} /><p>Pengajuan booking dibuat oleh Guru atau Wali Kelas. Sebagai {roleLabel(role)}, kamu dapat meninjau jadwal dan melihat status permintaan.</p></div>
          )}
        </section>

        <section className="panel schedule-panel">
          <div className="panel-heading">
            <div><h3>Ketersediaan jadwal</h3><p>{activeRoom?.name ?? 'Pilih ruangan'} · {formatDate(bookingDate)}</p></div>
          </div>
          <div className="schedule-legend"><span><i className="legend-free" />Waktu kosong</span><span><i className="legend-busy" />Sudah dipesan</span></div>
          {!dateIsWeekday(bookingDate) && <div className="inline-warning">Jadwal booking hanya berlaku Senin sampai Jumat.</div>}
          {selectedTimePassed && <div className="inline-warning">Jam mulai yang dipilih sudah lewat. Pilih jam berikutnya untuk hari ini atau pilih tanggal lain.</div>}
          {manualOccupancyConflict && activeRoom?.occupiedUntil && <div className="inline-warning">Waktu pilihan bertabrakan dengan pemakaian ruangan sampai {formatLocalDateTime(activeRoom.occupiedUntil)}.</div>}
          {bookingConflict && <div className="inline-warning">Waktu pilihan bertabrakan dengan booking {bookingConflict.start} sampai {bookingConflict.end}.</div>}
          <div className="schedule-queue" aria-live="polite">
            {manualOccupancyTouchesDate && activeRoom?.occupiedFrom && activeRoom.occupiedUntil && <p><strong>Pemakaian yang dicatat Admin: {formatLocalDateTime(activeRoom.occupiedFrom)} sampai {formatLocalDateTime(activeRoom.occupiedUntil)}.</strong></p>}
            {manualOccupancyActive && activeRoom?.occupiedUntil && <p><strong>Ruangan sedang terpakai sampai {formatLocalDateTime(activeRoom.occupiedUntil)}.</strong></p>}
            {visibleReservationQueue.length > 0
              ? visibleReservationQueue.map((booking) => {
                const isInUse = booking.status === 'disetujui' && booking.date === todayLocal() &&
                  new Date(`${booking.date}T${booking.start}:00`).getTime() <= now &&
                  new Date(`${booking.date}T${booking.end}:00`).getTime() > now
                const approvedIndex = reservationQueue
                  .filter((item) => item.status === 'disetujui')
                  .findIndex((item) => item.id === booking.id)
                const label = booking.status === 'diajukan_sarpras'
                  ? 'Menunggu Sarpras'
                  : booking.status === 'menunggu_kepsek'
                    ? 'Menunggu Kepala Sekolah'
                    : isInUse ? 'Sedang digunakan'
                      : approvedIndex === 0 ? 'Jadwal disetujui'
                        : `Antrean disetujui, urutan ${approvedIndex + 1}`
                return <p key={booking.id}><strong>{label}:</strong> {booking.start}–{booking.end} · {booking.requestedCapacity} orang</p>
              })
              : <p>Belum ada booking terjadwal pada tanggal ini.</p>}
          </div>
          <div className="slot-grid">
            {slotRows.map((slot) => {
              const slotPassed = now > 0 && bookingDate === todayLocal() &&
                new Date(`${bookingDate}T${slot.end}:00`).getTime() <= now
              return <div className={`slot ${slotPassed ? 'slot-past' : slot.blocked ? 'slot-busy' : 'slot-free'}`} key={slot.start}>
                <span>{slot.start}–{slot.end}</span>
                <small>{slotPassed ? 'Waktu sudah lewat' : slot.manualOccupancy ? 'Pemakaian ruangan' : slot.blocked ? 'Sudah ada booking' : 'Waktu kosong'}</small>
              </div>
            })}
          </div>
          <div className="schedule-footnote">Setiap booking aktif mengunci seluruh jadwal ruangan pada jam yang dipilih. Booking berikutnya bisa dimulai setelah jadwal sebelumnya selesai. Pengajuan yang ditolak atau dibatalkan tidak lagi menahan jadwal.</div>
        </section>
      </div>

      <section className="panel booking-history-panel">
        <div className="panel-heading"><div><h3>{canRequest ? 'Pengajuan saya' : 'Daftar pengajuan booking'}</h3><p>Status rekomendasi dan persetujuan ruangan</p></div></div>
        {userBookings.length === 0 ? (
          <EmptyState icon={CalendarDays} title="Belum ada pengajuan booking" description="Permintaan booking akan muncul setelah diajukan." />
        ) : (
          <div className="table-wrap"><table><thead><tr><th>Ruangan</th><th>Tanggal</th><th>Waktu</th><th>Keperluan</th><th>Status</th>{canRequest && <th></th>}</tr></thead>
            <tbody>{userBookings.map((booking) => {
              const room = rooms.find((item) => item.id === booking.roomId)
              return <tr key={booking.id}>
                <td><strong>{room?.name ?? 'Ruangan tidak ditemukan'}</strong><small>{room?.location}</small></td>
                <td>{formatDate(booking.date)}</td>
                <td>{booking.start}–{booking.end}</td>
                <td>{booking.purpose}{booking.rejectionNote && <small className="rejection-note">Alasan penolakan: {booking.rejectionNote}</small>}<small>{booking.requestedCapacity} orang · {booking.letterName ?? 'Surat belum dilampirkan'}</small></td>
                <td><span className={statusClass(booking.status)}>{BOOKING_LABELS[booking.status]}</span></td>
                {canRequest && <td>{['diajukan_sarpras', 'menunggu_kepsek'].includes(booking.status) && <button className="table-action" onClick={() => onCancel(booking.id)}>Batalkan</button>}</td>}
              </tr>
            })}</tbody>
          </table></div>
        )}
      </section>

      <section className="room-reference-row" aria-label="Informasi data ruangan">
        {displayRooms.map((room) => {
          const currentUse = currentRoomUse(room, bookings, now)
          return <div className="room-reference" key={room.id}><span className="room-ref-icon"><Building2 size={16} /></span><div><strong>{room.name}</strong><small>{room.code} · {room.capacity} orang</small></div><span className={currentUse ? 'room-status room-status-pending' : room.status === 'tersedia' ? 'room-status room-status-open' : 'room-status room-status-pending'}>{currentUse?.label ?? (room.status === 'tersedia' ? 'Tersedia' : 'Tentatif')}</span></div>
        })}
        <p className="source-note">Status awal mengikuti file data prasarana sekolah. Ruang berstatus Terpakai tidak ditawarkan untuk booking.</p>
      </section>
    </div>
  )
}

function ReviewView({
  role,
  tickets,
  bookings,
  rooms,
  onTicketUpdate,
  onBookingUpdate,
  onReadLetter,
}: {
  role: Role
  tickets: Ticket[]
  bookings: Booking[]
  rooms: Room[]
  onTicketUpdate: (id: string, status: TicketStatus) => void
  onBookingUpdate: (id: string, status: BookingStatus) => void
  onReadLetter: (booking: Booking) => void
}) {
  const roomName = (id: string) => rooms.find((room) => room.id === id)?.name ?? 'Ruangan'
  const sarprasTickets = tickets.filter((ticket) => role === 'sarpras'
    ? ['diajukan', 'verifikasi_sarpras', 'verifikasi_lapangan', 'proses_perbaikan'].includes(ticket.status)
    : ticket.status === 'menunggu_kepsek')
  const sarprasBookings = bookings.filter((booking) => role === 'sarpras'
    ? booking.status === 'diajukan_sarpras'
    : booking.status === 'menunggu_kepsek')
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
  const ticketAction: Partial<Record<TicketStatus, { label: string; next: TicketStatus }>> = {
    diajukan: { label: 'Mulai verifikasi', next: 'verifikasi_sarpras' },
    verifikasi_sarpras: { label: 'Catat verifikasi lapangan', next: 'verifikasi_lapangan' },
    verifikasi_lapangan: { label: 'Kirim ke Kepala Sekolah', next: 'menunggu_kepsek' },
    proses_perbaikan: { label: 'Tandai selesai', next: 'selesai' },
  }

  return (
    <div className="page-stack">
      <PageIntro
        title={role === 'sarpras' ? 'Tinjauan Wakasek Sarpras' : 'Persetujuan Kepala Sekolah'}
        description={role === 'sarpras' ? 'Verifikasi laporan dan berikan rekomendasi booking sebelum diteruskan.' : 'Tinjau permintaan yang sudah melewati rekomendasi Wakasek Sarpras.'}
      />
      <section className="panel review-section">
        <div className="panel-heading"><div><h3>{role === 'sarpras' ? 'Laporan untuk diverifikasi' : 'Usulan perbaikan'}</h3><p>Alur laporan: pengajuan Guru/Wali Kelas, verifikasi Sarpras, persetujuan Kepala Sekolah, perbaikan.</p></div></div>
        {sarprasTickets.length === 0 ? <EmptyState icon={TicketCheck} title="Tidak ada laporan untuk ditinjau" description="Laporan sesuai tahap peran ini akan tampil di sini." /> : (
          <div className="review-list">{sarprasTickets.map((ticket) => {
            const action = ticketAction[ticket.status]
            return <article className="review-item" key={ticket.id}>
              <div className="review-item-copy"><div className="ticket-number-line"><span>{ticket.number}</span><span className={statusClass(ticket.status)}>{TICKET_LABELS[ticket.status]}</span></div><h4>{ticket.title}</h4><p>{ticket.equipment} · {ticket.location}</p><p>{ticket.description}</p></div>
              <div className="review-item-actions">
                {role === 'sarpras' && action && <button className="button button-primary" onClick={() => onTicketUpdate(ticket.id, action.next)}>{action.label}<ArrowRight size={15} /></button>}
                {role === 'kepsek' && <><button className="button button-primary" onClick={() => onTicketUpdate(ticket.id, 'proses_perbaikan')}><Check size={15} />Setujui perbaikan</button><button className="button button-quiet" onClick={() => onTicketUpdate(ticket.id, 'ditolak')}><X size={15} />Tolak</button></>}
              </div>
            </article>
          })}</div>
        )}
      </section>

      <section className="panel review-section">
        <div className="panel-heading"><div><h3>{role === 'sarpras' ? 'Booking untuk direkomendasikan' : 'Booking untuk diputuskan'}</h3><p>Booking Guru/Wali Kelas, Senin sampai Jumat pukul 07.00–16.00. Waktu yang bertabrakan ditolak sebelum masuk daftar ini.</p></div></div>
        {sarprasBookings.length === 0 ? <EmptyState icon={CalendarDays} title="Tidak ada booking untuk ditinjau" description="Pengajuan booking akan tampil setelah dikirim." /> : (
          <div className="review-list">{sarprasBookings.map((booking) => <article className="review-item" key={booking.id}>
            <div className="review-item-copy"><div className="ticket-number-line"><span>Permintaan ruangan</span><span className={statusClass(booking.status)}>{BOOKING_LABELS[booking.status]}</span></div><h4>{roomName(booking.roomId)}</h4><p>{formatDate(booking.date)} · {booking.start} sampai {booking.end}</p><p>{booking.requestedCapacity} orang diminta, kapasitas ruangan {rooms.find((room) => room.id === booking.roomId)?.capacity ?? 'tidak diketahui'} orang.</p><p>{booking.purpose}</p><small>Pengaju: {booking.requester}</small></div>
            <div className="review-item-actions">
              {booking.letterId && <button className="button button-quiet" onClick={() => onReadLetter(booking)}><FileText size={15} />Baca surat PDF</button>}
              {role === 'sarpras' && <><button className="button button-primary" onClick={() => onBookingUpdate(booking.id, 'menunggu_kepsek')}><Check size={15} />Rekomendasikan</button><button className="button button-quiet" onClick={() => onBookingUpdate(booking.id, 'ditolak')}><X size={15} />Tolak</button></>}
              {role === 'kepsek' && <><button className="button button-primary" onClick={() => onBookingUpdate(booking.id, 'disetujui')}><Check size={15} />Setujui</button><button className="button button-quiet" onClick={() => onBookingUpdate(booking.id, 'ditolak')}><X size={15} />Tolak</button></>}
            </div>
          </article>)}</div>
        )}
      </section>
    </div>
  )
}

function AccountsView({
  accounts,
  currentUserId,
  onChangeRole,
  onApprove,
  onReject,
  onToggle,
  onDelete,
}: {
  accounts: ManagedAccount[]
  currentUserId: string
  onChangeRole: (id: string, role: Role) => void
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}) {
  function approvalLabel(account: ManagedAccount) {
    if (account.approvalStatus === 'pending') return 'Menunggu persetujuan'
    if (account.approvalStatus === 'rejected') return 'Ditolak'
    return account.isActive ? 'Aktif' : 'Dinonaktifkan'
  }

  return (
    <div className="page-stack">
      <PageIntro title="Kelola akun" description="Tinjau pendaftaran, tetapkan peran, dan aktifkan atau nonaktifkan profil Supabase." />
      <div className="form-note"><ShieldCheck size={16} />Menolak pendaftaran akan menghapus akun secara permanen. Akun dengan riwayat booking atau laporan tidak dapat dihapus.</div>
      <section className="panel review-section account-list-panel">
        <div className="panel-heading"><div><h3>Profil terdaftar</h3><p>{accounts.length} profil di Supabase</p></div></div>
        {accounts.length === 0 ? <EmptyState icon={Users} title="Belum ada profil" description="Profil akan muncul setelah pengguna mendaftar melalui halaman masuk." /> : (
          <div className="account-list">
            {accounts.map((account) => <article className="account-row" key={account.id}>
              <div className="account-details">
                <h4>{account.fullName}</h4>
                <p>{account.email}</p>
                <div><span className="role-chip">{roleLabel(account.role)}</span><span className={account.approvalStatus === 'approved' && account.isActive ? 'status status-green' : account.approvalStatus === 'rejected' ? 'status status-muted' : 'status status-gold'}>{approvalLabel(account)}</span></div>
              </div>
              <div className="account-actions">
                <label className="account-role-field"><span>Peran</span><select aria-label={`Peran ${account.fullName}`} value={account.role} onChange={(event) => onChangeRole(account.id, event.target.value as Role)}>{ROLES.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
                {account.approvalStatus !== 'approved' && <button className="button button-primary" onClick={() => onApprove(account.id)}><Check size={15} />Setujui</button>}
                {account.approvalStatus === 'pending' && <button className="button button-quiet" onClick={() => onReject(account.id)}><X size={15} />Tolak</button>}
                {account.approvalStatus === 'approved' && <button className="button button-quiet" onClick={() => onToggle(account.id)}>{account.isActive ? 'Nonaktifkan' : 'Aktifkan lagi'}</button>}
                {account.id !== currentUserId && account.role !== 'admin' && <button className="button button-quiet account-delete-button" onClick={() => onDelete(account.id)}><Trash2 size={15} />Hapus akun</button>}
              </div>
            </article>)}
          </div>
        )}
      </section>
    </div>
  )
}

function RoomsView({
  rooms,
  now,
  onToggle,
  onAdd,
  onDelete,
  onSetOccupancy,
  onClearOccupancy,
}: {
  rooms: Room[]
  now: number
  onToggle: (id: string) => void
  onAdd: (event: FormEvent<HTMLFormElement>) => void
  onDelete: (id: string) => void
  onSetOccupancy: (id: string, event: FormEvent<HTMLFormElement>) => void
  onClearOccupancy: (id: string) => void
}) {
  return (
    <div className="page-stack">
      <PageIntro title="Data ruangan" description="Periksa data ruang yang akan muncul sebagai pilihan booking. Status tentatif perlu dikonfirmasi sebelum dibuka." />
      <section className="room-admin-grid">
        {rooms.map((room) => <article className="panel room-admin-card" key={room.id}>
          <div className="room-admin-top"><span className="room-large-icon"><Building2 size={21} /></span><span className={room.status === 'tersedia' ? 'room-status room-status-open' : 'room-status room-status-pending'}>{room.status === 'tersedia' ? 'Tersedia' : 'Tentatif'}</span></div>
          <h3>{room.name}</h3><p>{room.location}</p>
          <div className="room-admin-details"><span>Kode</span><strong>{room.code}</strong><span>Kapasitas</span><strong>{room.capacity} orang</strong><span>Fasilitas</span><strong>{room.facilities}</strong></div>
          {room.occupiedFrom && room.occupiedUntil && new Date(room.occupiedUntil).getTime() > now && <p className="room-occupancy-status">Pemakaian tercatat sampai {formatLocalDateTime(room.occupiedUntil)}.</p>}
          <form className="room-occupancy-form" onSubmit={(event) => onSetOccupancy(room.id, event)}>
            <label className="field"><span>Terpakai sampai</span><input name="occupiedUntil" type="datetime-local" min={toLocalDateTime(new Date(now))} defaultValue={room.occupiedUntil ?? ''} required /></label>
            <button className="button button-quiet button-wide" type="submit"><Clock3 size={15} />Simpan waktu</button>
          </form>
          {room.occupiedUntil && <button className="button button-quiet button-wide" onClick={() => onClearOccupancy(room.id)}>Hapus jadwal terpakai</button>}
          <button className={room.status === 'tersedia' ? 'button button-quiet button-wide' : 'button button-primary button-wide'} onClick={() => onToggle(room.id)}>
            {room.status === 'tersedia' ? 'Tandai perlu konfirmasi' : 'Konfirmasi tersedia'}
          </button>
          <button className="button button-danger button-wide" onClick={() => onDelete(room.id)}><Trash2 size={15} />Hapus ruangan</button>
        </article>)}
      </section>
      <section className="panel form-panel room-add-panel">
        <div className="panel-heading"><div><h3>Tambah data ruangan</h3><p>Ruangan baru dimulai sebagai tentatif sampai kelayakannya dikonfirmasi.</p></div></div>
        <form className="room-add-form" onSubmit={onAdd}>
          <label className="field"><span>Nama ruangan</span><input name="name" placeholder="Nama sesuai data sekolah" required /></label>
          <label className="field"><span>Kode ruang</span><input name="code" placeholder="Kode ruang" required /></label>
          <label className="field"><span>Lokasi</span><input name="location" placeholder="Gedung dan lantai" required /></label>
          <label className="field"><span>Kapasitas</span><input name="capacity" type="number" min="1" placeholder="0" required /></label>
          <button className="button button-primary" type="submit"><Plus size={16} />Tambah ruangan</button>
        </form>
      </section>
      <p className="source-note">Data awal diambil dari PDF data prasarana SMP Habibi Bina Cendikia tahun ajaran 2026/2027 Ganjil. Fasilitas ruangan tidak diisi karena belum tercantum pada data yang diterima.</p>
    </div>
  )
}

function PageIntro({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return <section className="page-intro"><div><p className="eyebrow">SIRANA HBC</p><h2>{title}</h2><p>{description}</p></div>{action}</section>
}


function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof LayoutDashboard
  title: string
  description: string
}) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={21} /></span><h3>{title}</h3><p>{description}</p></div>
}

function TicketRow({ ticket }: { ticket: Ticket }) {
  return <div className="compact-row"><span className="compact-icon"><TicketCheck size={16} /></span><div className="compact-copy"><strong>{ticket.title}</strong><small>{ticket.equipment} · {formatShortDate(ticket.createdAt)}</small></div><span className={statusClass(ticket.status)}>{TICKET_LABELS[ticket.status]}</span></div>
}
