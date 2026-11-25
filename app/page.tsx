'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import Image from 'next/image'
import {
  Archive,
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
  RotateCcw,
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
type DamageSeverity = 'ringan' | 'sedang' | 'berat'
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
type View = 'dashboard' | 'tickets' | 'new-ticket' | 'booking' | 'dataset' | 'reviews' | 'rooms' | 'accounts'
type AccountApprovalStatus = 'pending' | 'approved' | 'rejected'

interface Room {
  id: string
  code: string
  name: string
  location: string
  capacity: number
  status: RoomStatus
  isArchived: boolean
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
  roomId: string | null
  roomName: string | null
  inventoryItemId: string | null
  damagedQuantity: number | null
  damageSeverity: DamageSeverity | null
  description: string
  requesterName: string
  photoName: string | null
  photoData: string | null
  photoPath: string | null
  createdAt: string
  status: TicketStatus
  rejectionNote?: string | null
  rejectionStage?: TicketStatus | null
  sarprasReport?: string | null
  sarprasReportPath?: string | null
}

interface InventoryItem {
  id: string
  roomId: string
  name: string
  quantity: number | null
  activeDamagedQuantity: number
  isActive: boolean
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
  rejectionStage?: BookingStatus | null
  sarprasReport?: string | null
  sarprasReportPath?: string | null
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

interface RecommendationDraft {
  kind: 'ticket' | 'booking'
  id: string
  title: string
  reference: string
  details: string[]
}


const ROLES: { id: Role; label: string; description: string }[] = [
  { id: 'guru', label: 'Guru / Wali Kelas', description: 'Mengajukan booking dan laporan' },
  { id: 'sarpras', label: 'Wakasek Sarpras', description: 'Memeriksa usulan dan mengelola data ruangan' },
  { id: 'kepsek', label: 'Kepala Sekolah', description: 'Memberi keputusan akhir' },
  { id: 'admin', label: 'Admin', description: 'Mengelola akun dan data ruangan' },
]


const DAMAGE_SEVERITY_LABELS: Record<DamageSeverity, string> = {
  ringan: 'Ringan',
  sedang: 'Sedang',
  berat: 'Berat',
}

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
  { id: 'dataset', label: 'Dataset', icon: Building2, roles: ['guru', 'sarpras', 'kepsek', 'admin'] },
  { id: 'reviews', label: 'Perlu ditinjau', icon: ClipboardCheck, roles: ['sarpras', 'kepsek'] },
  { id: 'rooms', label: 'Data ruangan', icon: Building2, roles: ['sarpras', 'admin'] },
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
  if (status === 'ditolak') return 'status status-danger'
  if (status === 'dibatalkan') return 'status status-muted'
  if (['menunggu_kepsek', 'verifikasi_lapangan'].includes(status)) return 'status status-gold'
  return 'status status-teal'
}

function formatActionError(error: { code?: string; message?: string }, fallback: string) {
  if (error.code === '23505') return 'Data dengan nilai tersebut sudah digunakan. Gunakan nilai lain.'
  if (error.code === '23503') return 'Data masih digunakan oleh catatan lain dan tidak dapat dihapus.'
  if (error.code === '42501') return 'Akun ini tidak memiliki izin untuk melakukan tindakan tersebut.'
  if (['P0001', '23514'].includes(error.code ?? '') && error.message && !/duplicate key|constraint|violates|permission denied|foreign key|row-level security/i.test(error.message)) {
    return error.message
  }
  return fallback
}

function dateIsValid(value: string) {
  return Boolean(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime())
}

function escapePdfText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)')
}

function createRecommendationPdf(title: string, reference: string, details: string[], report: string) {
  const sourceLines = [
    'SIRANA HBC',
    'LAPORAN REKOMENDASI SARANA DAN PRASARANA',
    `Jenis: ${title}`,
    `Nomor: ${reference}`,
    `Tanggal dibuat: ${formatDate(todayLocal())}`,
    '',
    ...details,
    '',
    'HASIL PEMERIKSAAN DAN REKOMENDASI',
    ...report.split(/\r?\n/),
  ]
  const lines = sourceLines.flatMap((sourceLine) => {
    const normalized = sourceLine.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, ' ')
    const words = normalized.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) return ['']
    const wrapped: string[] = []
    let line = ''
    for (const word of words) {
      if (line && `${line} ${word}`.length > 88) {
        wrapped.push(line)
        line = word
      } else {
        line = line ? `${line} ${word}` : word
      }
    }
    if (line) wrapped.push(line)
    return wrapped
  })
  const pageLines = Array.from({ length: Math.ceil(lines.length / 46) || 1 }, (_, index) => lines.slice(index * 46, (index + 1) * 46))
  const objects: string[] = []
  const pageIds = pageLines.map((_, index) => 3 + index * 2)
  const fontId = 3 + pageLines.length * 2

  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`
  pageLines.forEach((page, index) => {
    const pageId = pageIds[index]
    const contentId = pageId + 1
    const commands = ['BT', '/F1 10 Tf', '48 744 Td', '15 TL']
    page.forEach((line, lineIndex) => {
      if (lineIndex > 0) commands.push('T*')
      commands.push(`(${escapePdfText(line)}) Tj`)
    })
    commands.push('ET')
    const stream = commands.join('\n')
    objects[pageId - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`
    objects[contentId - 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  })
  objects[fontId - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(new TextEncoder().encode(pdf).length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = new TextEncoder().encode(pdf).length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n` })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return new Blob([pdf], { type: 'application/pdf' })
}

export default function HomePage() {
  const [data, setData] = useState<PrototypeData>({ role: 'guru', rooms: [], tickets: [], bookings: [], accounts: [] })
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
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
  const [openPhoto, setOpenPhoto] = useState<{ name: string; url: string } | null>(null)
  const [recommendationDraft, setRecommendationDraft] = useState<RecommendationDraft | null>(null)
  const [recommendationMode, setRecommendationMode] = useState<'text' | 'upload'>('text')
  const [recommendationText, setRecommendationText] = useState('')
  const [recommendationPdf, setRecommendationPdf] = useState<File | null>(null)
  const [recommendationSubmitting, setRecommendationSubmitting] = useState(false)
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
        setInventoryItems([])
        setReady(true)
        return
      }
      const [roomsResult, bookingsResult, ticketsResult, inventoryResult, profilesResult] = await Promise.all([
        supabase!.from('rooms').select('*').order('name'),
        Promise.all([
          supabase!.from('room_bookings').select('*').order('booking_date').order('start_time'),
          supabase!.from('booking_slots').select('*').order('booking_date').order('start_time'),
        ]),
        supabase!.from('damage_tickets').select('*').order('created_at', { ascending: false }),
        supabase!.from('room_inventory_items').select('*').eq('is_active', true).order('name'),
        role === 'admin' ? supabase!.from('profiles').select('*').order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
      ])
      if (!active) return
      const [bookingDetailsResult, bookingSlotsResult] = bookingsResult
      const failure = roomsResult.error ?? bookingDetailsResult.error ?? bookingSlotsResult.error ?? ticketsResult.error ?? inventoryResult.error ?? profilesResult.error
      if (failure) {
        setConnectionError(`Data Supabase tidak dapat dimuat: ${failure.message}`)
        setReady(true)
        return
      }
      const rooms = (roomsResult.data ?? []).map((room) => ({
        id: room.id, code: room.code, name: room.name, location: room.location, capacity: room.capacity,
        status: room.status === 'tersedia' ? 'tersedia' as const : 'tentatif' as const,
        isArchived: room.is_archived ?? false,
        occupiedFrom: room.occupied_from, occupiedUntil: room.occupied_until, facilities: room.facilities ?? 'Belum dicantumkan.',
      }))
      const inventoryItems = (inventoryResult.data ?? []).map((item) => ({
        id: item.id, roomId: item.room_id, name: item.name, quantity: item.quantity,
        activeDamagedQuantity: item.active_damaged_quantity, isActive: item.is_active,
      }))
      const detailedBookings = (bookingDetailsResult.data ?? []).map((booking) => ({
        id: booking.id, roomId: booking.room_id, date: booking.booking_date,
        start: String(booking.start_time).slice(0, 5), end: String(booking.end_time).slice(0, 5),
        requestedCapacity: booking.requested_capacity, purpose: booking.purpose,
        letterId: booking.letter_path, letterName: booking.letter_path.split('/').at(-1)?.replace(/^[a-f0-9-]+__/, '') ?? 'Surat pengajuan.pdf',
        requester: booking.requested_by_name ?? (booking.requested_by === authUser!.id ? profileRow.full_name : 'Pengaju'),
        requesterId: booking.requested_by, createdAt: booking.created_at, status: booking.status as BookingStatus,
        rejectionNote: booking.sarpras_note ?? booking.decision_note,
        rejectionStage: booking.rejection_stage as BookingStatus | null,
        sarprasReport: booking.sarpras_report ?? null,
        sarprasReportPath: booking.sarpras_report_path ?? null,
      }))
      const detailedIds = new Set(detailedBookings.map((booking) => booking.id))
      const scheduleBookings = (bookingSlotsResult.data ?? []).filter((booking) => !detailedIds.has(booking.id)).map((booking) => ({
        id: booking.id, roomId: booking.room_id, date: booking.booking_date,
        start: String(booking.start_time).slice(0, 5), end: String(booking.end_time).slice(0, 5),
        requestedCapacity: booking.requested_capacity, purpose: '', letterId: null, letterName: null,
        requester: 'Pengaju', requesterId: null, createdAt: '', status: booking.status as BookingStatus, rejectionNote: null,
      }))
      const bookings = [...detailedBookings, ...scheduleBookings].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
      const tickets = await Promise.all((ticketsResult.data ?? []).map(async (ticket) => {
        const photoUrl = ticket.photo_url
          ? (await supabase!.storage.from('damage-photos').createSignedUrl(ticket.photo_url, 3600)).data?.signedUrl ?? null
          : null
        return {
          id: ticket.id, number: ticket.ticket_number, title: ticket.title, category: ticket.category,
          equipment: ticket.equipment, location: ticket.location, description: ticket.description,
          roomId: ticket.room_id ?? null,
          roomName: rooms.find((room) => room.id === ticket.room_id)?.name ?? null,
          inventoryItemId: ticket.inventory_item_id ?? null,
          damagedQuantity: ticket.damaged_quantity ?? null,
          damageSeverity: ticket.damage_severity as DamageSeverity | null ?? null,
          requesterName: ticket.reported_by_name ?? 'Pengaju',
          photoName: ticket.photo_url ? 'Foto terlampir' : null, photoData: photoUrl, photoPath: ticket.photo_url ?? null,
          createdAt: ticket.created_at, status: ticket.status as TicketStatus, rejectionNote: ticket.decision_note ?? null,
          rejectionStage: ticket.rejection_stage as TicketStatus | null,
          sarprasReport: ticket.sarpras_report ?? null,
          sarprasReportPath: ticket.sarpras_report_path ?? null,
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
      setInventoryItems(inventoryItems)
      setBookingRoom((selected) => rooms.some((room) => room.id === selected && !room.isArchived) ? selected : rooms.find((room) => !room.isArchived)?.id ?? '')
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

  useEffect(() => {
    if (!openPhoto) return
    const closeButton = document.querySelector<HTMLElement>('.photo-dialog-close')
    closeButton?.focus()
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenPhoto(null)
      if (event.key === 'Tab') {
        event.preventDefault()
        closeButton?.focus()
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      previousFocus.current?.focus()
      previousFocus.current = null
    }
  }, [openPhoto])

  useEffect(() => {
    if (!recommendationDraft) return
    const dialog = document.querySelector('.recommendation-dialog')
    const getFocusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)') ?? [])
    getFocusable()[0]?.focus()
    function keepReportFocus(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (!recommendationSubmitting) setRecommendationDraft(null)
        return
      }
      if (event.key !== 'Tab') return
      const focusable = getFocusable()
      if (focusable.length === 0) return
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
    window.addEventListener('keydown', keepReportFocus)
    return () => {
      window.removeEventListener('keydown', keepReportFocus)
      previousFocus.current?.focus()
      previousFocus.current = null
    }
  }, [recommendationDraft, recommendationSubmitting])

  useEffect(() => () => {
    if (openDocument) URL.revokeObjectURL(openDocument.url)
  }, [openDocument])

  const role = data.role
  const noticeIsError = /gagal|tidak dapat|belum dapat|tidak bisa|sudah dipakai|tidak ditemukan|akses ditolak|hanya admin|harus|wajib|lengkapi|pilih |isi |masukkan|lampirkan|melebihi|bertabrakan|tidak valid|bukan .*valid|maksimal|tidak tersedia|belum berhasil|tidak terhapus/i.test(notice)
  const reviewLabel = role === 'sarpras'
    ? 'Tinjauan Wakasek Sarpras'
    : role === 'kepsek' ? 'Persetujuan Kepala Sekolah' : 'Perlu ditinjau'
  const navItems = NAVIGATION.filter((item) => item.roles.includes(role)).map((item) =>
    item.id === 'reviews' ? { ...item, label: reviewLabel } : item,
  )
  const currentView = NAVIGATION.find((item) => item.id === view)
  const activeRoom = data.rooms.find((room) => room.id === bookingRoom)
  const bookableRooms = data.rooms.filter((room) => !room.isArchived && room.status === 'tersedia')
  const currentTickets = data.tickets
  const currentBookings = data.bookings

  const pendingTickets = data.tickets.filter((ticket) => !['selesai', 'ditolak'].includes(ticket.status))
  const pendingBookings = data.bookings.filter((booking) => ['diajukan_sarpras', 'menunggu_kepsek'].includes(booking.status))
  const reviewCount = role === 'sarpras'
    ? data.tickets.filter((ticket) => ['diajukan', 'verifikasi_sarpras', 'verifikasi_lapangan', 'proses_perbaikan'].includes(ticket.status)).length
      + data.bookings.filter((booking) => booking.status === 'diajukan_sarpras').length
    : data.tickets.filter((ticket) => ticket.status === 'menunggu_kepsek').length
      + data.bookings.filter((booking) => booking.status === 'menunggu_kepsek').length

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
    setInventoryItems([])
    setView('dashboard')
  }

  async function updateAccount(accountId: string, role: Role) {
    if (!supabase) return
    const { error } = await supabase.from('profiles').update({ role, updated_at: new Date().toISOString() }).eq('id', accountId)
    if (error) {
      announce(formatActionError(error, 'Perubahan peran akun gagal disimpan. Coba lagi.'))
      return
    }
    setData((previous) => ({ ...previous, accounts: previous.accounts.map((account) => account.id === accountId ? { ...account, role } : account) }))
    announce('Peran akun berhasil diperbarui.')
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
      announce(formatActionError(error, 'Persetujuan akun gagal disimpan. Coba lagi.'))
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
      announce(formatActionError(error, 'Status aktif akun gagal diperbarui. Coba lagi.'))
      return
    }
    setData((previous) => ({ ...previous, accounts: previous.accounts.map((item) => item.id === accountId ? { ...item, isActive } : item) }))
    announce('Status akun berhasil diperbarui.')
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
      announce('Pendaftaran belum dapat ditolak karena akun gagal dihapus. Coba lagi atau hubungi Admin jika masalah berlanjut.')
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
      announce('Akun gagal dihapus. Coba lagi atau hubungi Admin jika masalah berlanjut.')
      return
    }

    setData((previous) => ({ ...previous, accounts: previous.accounts.filter((item) => item.id !== accountId) }))
    announce(`Akun ${account.fullName} berhasil dihapus.`)
  }

  async function addInventoryItem(roomId: string, name: string, quantity: number) {
    if (!supabase || !profile || !['admin', 'sarpras'].includes(profile.role)) return false
    const { data: saved, error } = await supabase.from('room_inventory_items')
      .insert({ room_id: roomId, name, quantity })
      .select('*')
      .single()
    if (error || !saved) {
      announce(error ? formatActionError(error, 'Barang gagal ditambahkan. Periksa nama barang dan ruangan.') : 'Ruangan tidak ditemukan. Muat ulang daftar ruangan lalu coba lagi.')
      return false
    }
    setInventoryItems((previous) => [...previous, {
      id: saved.id, roomId: saved.room_id, name: saved.name, quantity: saved.quantity,
      activeDamagedQuantity: saved.active_damaged_quantity, isActive: saved.is_active,
    }].sort((a, b) => a.name.localeCompare(b.name)))
    announce('Barang ditambahkan ke dataset Supabase.')
    return true
  }

  async function updateInventoryQuantity(itemId: string, quantity: number) {
    if (!supabase || !profile || !['admin', 'sarpras'].includes(profile.role)) return false
    const current = inventoryItems.find((item) => item.id === itemId)
    if (!current || !Number.isInteger(quantity) || quantity < current.activeDamagedQuantity) {
      announce('Jumlah total tidak boleh kurang dari jumlah rusak yang masih aktif.')
      return false
    }
    const { data: updated, error } = await supabase.from('room_inventory_items')
      .update({ quantity, updated_at: new Date().toISOString() })
      .eq('id', itemId)
      .select('*')
      .maybeSingle()
    if (error || !updated) {
      announce(error ? formatActionError(error, 'Jumlah barang gagal diperbarui. Coba lagi.') : 'Barang tidak ditemukan. Muat ulang dataset lalu coba lagi.')
      return false
    }
    setInventoryItems((previous) => previous.map((item) => item.id === itemId ? {
      ...item, quantity: updated.quantity, activeDamagedQuantity: updated.active_damaged_quantity,
    } : item))
    announce('Jumlah barang berhasil diperbarui.')
    return true
  }

  async function archiveInventoryItem(itemId: string) {
    if (!supabase || !profile || !['admin', 'sarpras'].includes(profile.role)) return false
    const { data: archived, error } = await supabase.from('room_inventory_items')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', itemId)
      .select('id')
      .maybeSingle()
    if (error || !archived) {
      announce(error ? formatActionError(error, 'Barang tidak dapat dihapus. Pastikan tidak ada laporan kerusakan yang masih aktif.') : 'Barang tidak ditemukan atau masih memiliki laporan kerusakan aktif.')
      return false
    }
    setInventoryItems((previous) => previous.filter((item) => item.id !== itemId))
    announce('Barang dihapus dari dataset aktif.')
    return true
  }

  async function submitTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const title = String(form.get('title') ?? '').trim()
    const roomId = String(form.get('roomId') ?? '')
    const selectedItemId = String(form.get('inventoryItemId') ?? '')
    const isOther = selectedItemId === 'other'
    const item = isOther ? null : inventoryItems.find((candidate) => candidate.id === selectedItemId) ?? null
    const equipment = isOther ? String(form.get('otherEquipment') ?? '').trim() : item?.name ?? ''
    const description = String(form.get('description') ?? '').trim()
    const category = 'Kerusakan fasilitas'
    const damagedQuantity = Number(form.get('damagedQuantity'))
    const room = data.rooms.find((candidate) => candidate.id === roomId)
    if (!supabase || !authUser) return
    if (!room || !title || !equipment || !description || !Number.isInteger(damagedQuantity) || damagedQuantity < 1) {
      announce('Lengkapi ruangan, barang, jumlah rusak, judul, dan deskripsi laporan.')
      return
    }
    if (!isOther) {
      const available = item?.quantity === null || !item ? 0 : Math.max(0, item.quantity - item.activeDamagedQuantity)
      if (!item || item.roomId !== room.id || !item.isActive || damagedQuantity > available) {
        announce(`Jumlah melebihi stok tersedia. Sisa stok ${available} unit.`)
        return
      }
    }

    const ticketId = newId()
    let photoPath: string | null = null
    if (photo) {
      const extension = photo.name.split('.').pop()?.toLowerCase() || 'jpg'
      photoPath = `${authUser.id}/${ticketId}.${extension}`
      const upload = await supabase.storage.from('damage-photos').upload(photoPath, photo.file, { upsert: false })
      if (upload.error) {
        announce(formatActionError(upload.error, 'Foto gagal diunggah. Coba pilih foto lain atau hubungi Admin jika masalah berlanjut.'))
        return
      }
    }
    const { data: saved, error } = await supabase.from('damage_tickets').insert({
      reported_by: authUser.id, title, category, equipment, location: room.location, description,
      room_id: room.id, inventory_item_id: item?.id ?? null, damaged_quantity: damagedQuantity, photo_url: photoPath,
    }).select('*').single()
    if (error) {
      if (photoPath) await supabase.storage.from('damage-photos').remove([photoPath])
      announce(formatActionError(error, 'Laporan kerusakan gagal disimpan. Periksa isian lalu coba lagi.'))
      return
    }
    let photoUrl: string | null = null
    if (photoPath) photoUrl = (await supabase.storage.from('damage-photos').createSignedUrl(photoPath, 3600)).data?.signedUrl ?? null
    const ticket: Ticket = {
      id: saved.id, number: saved.ticket_number, title: saved.title, category: saved.category,
      equipment: saved.equipment, location: saved.location, description: saved.description,
      roomId: saved.room_id, roomName: room.name, inventoryItemId: saved.inventory_item_id,
      damagedQuantity: saved.damaged_quantity, damageSeverity: null,
      requesterName: saved.reported_by_name ?? profile?.fullName ?? 'Pengaju',
      photoName: photo ? 'Foto terlampir' : null, photoData: photoUrl, photoPath,
      createdAt: saved.created_at, status: saved.status as TicketStatus,
      rejectionNote: null, rejectionStage: null, sarprasReport: null, sarprasReportPath: null,
    }
    setData((previous) => ({ ...previous, tickets: [ticket, ...previous.tickets] }))
    if (item) {
      setInventoryItems((previous) => previous.map((candidate) => candidate.id === item.id
        ? { ...candidate, activeDamagedQuantity: candidate.activeDamagedQuantity + damagedQuantity }
        : candidate))
    }
    formElement.reset()
    setPhoto(null)
    setView('tickets')
    announce('Laporan berhasil disimpan dan dikirim ke Wakasek Sarpras.')
  }

  async function updateTicket(ticketId: string, status: TicketStatus, damageSeverity?: DamageSeverity) {
    if (!supabase || !profile) return
    const currentTicket = data.tickets.find((ticket) => ticket.id === ticketId)
    if (!currentTicket) return
    if (status === 'verifikasi_sarpras' && !damageSeverity && !currentTicket.damageSeverity) {
      announce('Pilih tingkat kerusakan sebelum memulai verifikasi.')
      return
    }
    let note: string | null = null
    if (status === 'ditolak') {
      note = window.prompt('Tuliskan alasan penolakan (wajib):')?.trim() ?? ''
      if (!note) {
        announce('Penolakan dibatalkan. Alasan penolakan wajib diisi.')
        return
      }
    }
    const values: Record<string, string> = { status, updated_at: new Date().toISOString() }
    if (damageSeverity) values.damage_severity = damageSeverity
    if (note) {
      values.decision_note = note
      values.rejection_stage = currentTicket.status
    }
    if (profile.role === 'sarpras') {
      values.verified_by = profile.id
      if (status === 'verifikasi_lapangan') values.field_verified_at = new Date().toISOString()
    } else if (profile.role === 'kepsek') {
      values.decided_by = profile.id
    }
    if (status === 'selesai') values.completed_at = new Date().toISOString()
    const { data: updated, error } = await supabase.from('damage_tickets').update(values).eq('id', ticketId).select('id').maybeSingle()
    if (error || !updated) {
      announce(error ? formatActionError(error, 'Status laporan gagal diperbarui. Muat ulang halaman lalu coba lagi.') : 'Laporan tidak ditemukan. Muat ulang daftar lalu coba lagi.')
      return
    }
    setData((previous) => ({ ...previous, tickets: previous.tickets.map((ticket) => ticket.id === ticketId ? {
      ...ticket, status, damageSeverity: damageSeverity ?? ticket.damageSeverity,
      rejectionNote: note ?? ticket.rejectionNote,
      rejectionStage: note ? currentTicket.status : ticket.rejectionStage,
    } : ticket) }))
    const wasActive = !['selesai', 'ditolak'].includes(currentTicket.status)
    const isActive = !['selesai', 'ditolak'].includes(status)
    if (currentTicket.inventoryItemId && wasActive !== isActive) {
      const quantityChange = (isActive ? 1 : -1) * (currentTicket.damagedQuantity ?? 0)
      setInventoryItems((previous) => previous.map((item) => item.id === currentTicket.inventoryItemId
        ? { ...item, activeDamagedQuantity: Math.max(0, item.activeDamagedQuantity + quantityChange) }
        : item))
    }
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
    if (!bookingDate || !dateIsValid(bookingDate)) {
      announce('Pilih tanggal booking yang valid.')
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
      announce(formatActionError(upload.error, 'Surat PDF gagal diunggah. Coba pilih file lagi atau hubungi Admin jika masalah berlanjut.'))
      return
    }
    const { data: saved, error } = await supabase.from('room_bookings').insert({
      id: bookingId, room_id: bookingRoom, requested_by: authUser.id, booking_date: bookingDate,
      start_time: start, end_time: end, requested_capacity: requestedCapacity, purpose, letter_path: letterPath,
    }).select('*').single()
    if (error) {
      await supabase.storage.from('booking-letters').remove([letterPath])
      setBookingSubmitting(false)
      announce(formatActionError(error, 'Pengajuan booking gagal disimpan. Periksa isian lalu coba lagi.'))
      return
    }
    setBookingSubmitting(false)
    const booking: Booking = {
      id: saved.id, roomId: saved.room_id, date: saved.booking_date,
      start: String(saved.start_time).slice(0, 5), end: String(saved.end_time).slice(0, 5),
      requestedCapacity: saved.requested_capacity, purpose: saved.purpose,
      letterId: saved.letter_path, letterName: bookingLetter.name,
      requester: saved.requested_by_name ?? profile.fullName, requesterId: authUser.id,
      createdAt: saved.created_at, status: saved.status as BookingStatus,
      rejectionNote: null, rejectionStage: null, sarprasReport: null, sarprasReportPath: null,
    }
    setData((previous) => ({ ...previous, bookings: [booking, ...previous.bookings] }))
    formElement.reset()
    setBookingStart('09:00')
    setBookingEnd('10:00')
    setBookingCapacity('1')
    setBookingLetter(null)
    announce('Pengajuan booking dan surat berhasil dikirim ke Sarpras untuk ditinjau.')
  }

  async function readStoredPdf(bucket: 'booking-letters' | 'sarpras-reports', path: string | null, name: string) {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!supabase || !path) {
      announce('File PDF tidak tersedia.')
      return
    }
    const { data: file, error } = await supabase.storage.from(bucket).download(path)
    if (error || !file) {
      announce(error ? formatActionError(error, 'File PDF gagal dibuka. Coba lagi atau hubungi pengirim file.') : 'File PDF tidak ditemukan.')
      return
    }
    setOpenDocument({ name, url: URL.createObjectURL(file) })
  }

  async function readBookingLetter(booking: Booking) {
    await readStoredPdf('booking-letters', booking.letterId, booking.letterName ?? 'Surat pengajuan.pdf')
  }

  async function readSarprasReport(path: string | null, name: string) {
    await readStoredPdf('sarpras-reports', path, name)
  }

  function prepareTicketRecommendation(ticket: Ticket) {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setRecommendationMode('text')
    setRecommendationText('')
    setRecommendationPdf(null)
    setRecommendationDraft({
      kind: 'ticket', id: ticket.id, title: 'Laporan kerusakan', reference: ticket.number,
      details: [`Judul: ${ticket.title}`, `Fasilitas: ${ticket.equipment}`, `Jumlah rusak: ${ticket.damagedQuantity ?? '–'}`, `Lokasi: ${ticket.roomName ?? ticket.location}`, `Jenis: ${ticket.category}`, ...(ticket.damageSeverity ? [`Tingkat kerusakan: ${DAMAGE_SEVERITY_LABELS[ticket.damageSeverity]}`] : []), `Deskripsi: ${ticket.description}`],
    })
  }

  function prepareBookingRecommendation(booking: Booking) {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const room = data.rooms.find((item) => item.id === booking.roomId)
    setRecommendationMode('text')
    setRecommendationText('')
    setRecommendationPdf(null)
    setRecommendationDraft({
      kind: 'booking', id: booking.id, title: 'Booking ruangan', reference: booking.id,
      details: [`Pemohon: ${booking.requester}`, `Ruangan: ${room?.name ?? 'Ruangan'}`, `Tanggal: ${formatDate(booking.date)}`, `Waktu: ${booking.start} sampai ${booking.end}`, `Kapasitas: ${booking.requestedCapacity} orang`, `Keperluan: ${booking.purpose}`],
    })
  }

  async function submitRecommendation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const draft = recommendationDraft
    const report = recommendationText.trim()
    const uploadedPdf = recommendationPdf
    if (!draft || !supabase || !profile || profile.role !== 'sarpras') return
    if (recommendationMode === 'text' && !report) {
      announce('Isi hasil pemeriksaan dan rekomendasi sebelum diteruskan.')
      return
    }
    if (recommendationMode === 'upload' && !uploadedPdf) {
      announce('Pilih PDF rekomendasi yang akan diteruskan.')
      return
    }

    setRecommendationSubmitting(true)
    const pdf = recommendationMode === 'text'
      ? createRecommendationPdf(draft.title, draft.reference, draft.details, report)
      : uploadedPdf!
    const path = `${profile.id}/${draft.kind}-${draft.id}-${newId()}-rekomendasi.pdf`
    const upload = await supabase.storage.from('sarpras-reports').upload(path, pdf, {
      contentType: 'application/pdf', upsert: false,
    })
    if (upload.error) {
      setRecommendationSubmitting(false)
      announce(formatActionError(upload.error, 'PDF rekomendasi gagal diunggah. Coba pilih file lagi.'))
      return
    }

    const reportValue = recommendationMode === 'text' ? report : null
    const values = {
      status: 'menunggu_kepsek', sarpras_report: reportValue, sarpras_report_path: path,
      updated_at: new Date().toISOString(),
      ...(draft.kind === 'ticket' ? { verified_by: profile.id } : { recommended_by: profile.id }),
    }
    const table = draft.kind === 'ticket' ? 'damage_tickets' : 'room_bookings'
    const { data: updated, error } = await supabase.from(table).update(values).eq('id', draft.id).select('id').maybeSingle()
    if (error || !updated) {
      await supabase.storage.from('sarpras-reports').remove([path])
      setRecommendationSubmitting(false)
      announce(error ? formatActionError(error, 'Rekomendasi gagal diteruskan. Muat ulang daftar lalu coba lagi.') : 'Permintaan tidak ditemukan. Muat ulang daftar lalu coba lagi.')
      return
    }

    if (draft.kind === 'ticket') {
      setData((previous) => ({ ...previous, tickets: previous.tickets.map((ticket) => ticket.id === draft.id
        ? { ...ticket, status: 'menunggu_kepsek', sarprasReport: reportValue, sarprasReportPath: path }
        : ticket) }))
    } else {
      setData((previous) => ({ ...previous, bookings: previous.bookings.map((booking) => booking.id === draft.id
        ? { ...booking, status: 'menunggu_kepsek', sarprasReport: reportValue, sarprasReportPath: path }
        : booking) }))
    }
    setRecommendationSubmitting(false)
    setRecommendationDraft(null)
    setRecommendationMode('text')
    setRecommendationText('')
    setRecommendationPdf(null)
    announce('Rekomendasi dan PDF Sarpras tersimpan, permintaan diteruskan ke Kepala Sekolah.')
  }

  function openTicketPhoto(name: string, url: string) {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setOpenPhoto({ name, url })
  }

  async function deleteTickets(ticketIds: string[]) {
    if (!supabase || profile?.role !== 'admin' || ticketIds.length === 0) {
      announce('Hanya Admin yang dapat menghapus laporan kerusakan.')
      return false
    }
    const ticketsToDelete = data.tickets.filter((ticket) => ticketIds.includes(ticket.id))
    if (ticketsToDelete.length !== ticketIds.length) {
      announce('Sebagian laporan yang dipilih sudah tidak tersedia. Muat ulang daftar lalu coba lagi.')
      return false
    }
    const { data: deletedRows, error } = await supabase.from('damage_tickets').delete().in('id', ticketIds).select('id')
    if (error || !deletedRows || deletedRows.length !== ticketIds.length) {
      announce(error ? formatActionError(error, 'Laporan kerusakan gagal dihapus. Muat ulang daftar lalu coba lagi.') : 'Laporan tidak terhapus. Muat ulang daftar lalu coba lagi.')
      return false
    }

    setData((previous) => ({ ...previous, tickets: previous.tickets.filter((ticket) => !ticketIds.includes(ticket.id)) }))
    const photoPaths = ticketsToDelete.map((ticket) => ticket.photoPath).filter((path): path is string => Boolean(path))
    const reportPaths = ticketsToDelete.map((ticket) => ticket.sarprasReportPath).filter((path): path is string => Boolean(path))
    const cleanupErrors: string[] = []
    if (photoPaths.length > 0) {
      const { error: cleanupError } = await supabase.storage.from('damage-photos').remove(photoPaths)
      if (cleanupError) cleanupErrors.push(cleanupError.message)
    }
    if (reportPaths.length > 0) {
      const { error: cleanupError } = await supabase.storage.from('sarpras-reports').remove(reportPaths)
      if (cleanupError) cleanupErrors.push(cleanupError.message)
    }
    const { data: inventoryRows, error: inventoryError } = await supabase.from('room_inventory_items').select('*').eq('is_active', true).order('name')
    if (inventoryError) cleanupErrors.push(`Dataset barang tidak dapat diperbarui: ${inventoryError.message}`)
    else setInventoryItems((inventoryRows ?? []).map((item) => ({
      id: item.id, roomId: item.room_id, name: item.name, quantity: item.quantity,
      activeDamagedQuantity: item.active_damaged_quantity, isActive: item.is_active,
    })))

    if (cleanupErrors.length > 0) {
      announce(`${deletedRows.length} laporan dihapus, tetapi sebagian foto atau PDF gagal dihapus, atau dataset gagal diperbarui. Coba muat ulang halaman.`)
    } else {
      announce(`${deletedRows.length} laporan kerusakan berhasil dihapus.`)
    }
    return true
  }

  async function deleteBookings(bookingIds: string[]) {
    if (!supabase || profile?.role !== 'admin' || bookingIds.length === 0) {
      announce('Hanya Admin yang dapat menghapus riwayat booking.')
      return false
    }
    const bookingsToDelete = data.bookings.filter((booking) => bookingIds.includes(booking.id))
    if (bookingsToDelete.length !== bookingIds.length) {
      announce('Sebagian booking yang dipilih sudah tidak tersedia. Muat ulang daftar lalu coba lagi.')
      return false
    }
    const { data: deletedRows, error } = await supabase.from('room_bookings').delete().in('id', bookingIds).select('id')
    if (error || !deletedRows || deletedRows.length !== bookingIds.length) {
      announce(error ? formatActionError(error, 'Riwayat booking gagal dihapus. Muat ulang daftar lalu coba lagi.') : 'Booking tidak terhapus. Muat ulang daftar lalu coba lagi.')
      return false
    }
    setData((previous) => ({ ...previous, bookings: previous.bookings.filter((booking) => !bookingIds.includes(booking.id)) }))
    const letterPaths = bookingsToDelete.map((booking) => booking.letterId).filter((path): path is string => Boolean(path))
    const reportPaths = bookingsToDelete.map((booking) => booking.sarprasReportPath).filter((path): path is string => Boolean(path))
    const cleanupErrors: string[] = []
    if (letterPaths.length > 0) {
      const { error: cleanupError } = await supabase.storage.from('booking-letters').remove(letterPaths)
      if (cleanupError) cleanupErrors.push(cleanupError.message)
    }
    if (reportPaths.length > 0) {
      const { error: cleanupError } = await supabase.storage.from('sarpras-reports').remove(reportPaths)
      if (cleanupError) cleanupErrors.push(cleanupError.message)
    }
    if (cleanupErrors.length > 0) {
      announce(`${deletedRows.length} booking dihapus, tetapi sebagian PDF gagal dihapus. Coba muat ulang halaman.`)
    } else {
      announce(`${deletedRows.length} riwayat booking berhasil dihapus.`)
    }
    return true
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
    const currentBooking = data.bookings.find((booking) => booking.id === bookingId)
    if (!currentBooking) return
    const values: Record<string, string | null> = { status, updated_at: new Date().toISOString() }
    if (note) {
      values[profile.role === 'sarpras' ? 'sarpras_note' : 'decision_note'] = note
      values.rejection_stage = currentBooking.status
    }
    if (profile.role === 'sarpras' && status === 'menunggu_kepsek') values.recommended_by = profile.id
    if (profile.role === 'kepsek') values.decided_by = profile.id
    const { data: updated, error } = await supabase.from('room_bookings').update(values).eq('id', bookingId).select('id').maybeSingle()
    if (error || !updated) {
      announce(error ? formatActionError(error, 'Status booking gagal diperbarui. Muat ulang daftar lalu coba lagi.') : 'Booking tidak ditemukan. Muat ulang daftar lalu coba lagi.')
      return
    }
    setData((previous) => ({ ...previous, bookings: previous.bookings.map((booking) => booking.id === bookingId ? {
      ...booking, status, rejectionNote: note ?? booking.rejectionNote,
      rejectionStage: note ? currentBooking.status : booking.rejectionStage,
    } : booking) }))
    announce(`Status booking berhasil diperbarui: ${BOOKING_LABELS[status]}.`)
  }

  async function toggleRoom(roomId: string) {
    if (!supabase) return
    const room = data.rooms.find((item) => item.id === roomId)
    if (!room) return
    const status = room.status === 'tersedia' ? 'tentatif' : 'tersedia'
    const { error } = await supabase.from('rooms').update({ status, updated_at: new Date().toISOString() }).eq('id', roomId)
    if (error) {
      announce(formatActionError(error, 'Status ruangan gagal disimpan. Coba lagi.'))
      return
    }
    setData((previous) => ({ ...previous, rooms: previous.rooms.map((item) => item.id === roomId ? { ...item, status } : item) }))
    announce('Status ruangan berhasil diperbarui.')
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
      announce(formatActionError(error, 'Waktu pemakaian gagal disimpan. Coba lagi.'))
      return
    }
    setData((previous) => ({ ...previous, rooms: previous.rooms.map((room) => room.id === roomId ? { ...room, occupiedFrom, occupiedUntil } : room) }))
    announce(`Waktu pemakaian sampai ${formatLocalDateTime(occupiedUntil)} berhasil disimpan.`)
  }

  async function clearRoomOccupancy(roomId: string) {
    if (!supabase) return
    const { error } = await supabase.from('rooms').update({ occupied_from: null, occupied_until: null, updated_at: new Date().toISOString() }).eq('id', roomId)
    if (error) {
      announce(formatActionError(error, 'Jadwal pemakaian gagal dihapus. Coba lagi.'))
      return
    }
    setData((previous) => ({ ...previous, rooms: previous.rooms.map((room) => room.id === roomId ? { ...room, occupiedFrom: null, occupiedUntil: null } : room) }))
    announce('Jadwal pemakaian ruangan berhasil dihapus.')
  }

  async function setRoomArchived(roomId: string, isArchived: boolean) {
    if (!supabase) return
    const room = data.rooms.find((item) => item.id === roomId)
    if (!room) return
    const { error } = await supabase.from('rooms').update({ is_archived: isArchived, updated_at: new Date().toISOString() }).eq('id', roomId)
    if (error) {
      announce(formatActionError(error, 'Status arsip ruangan gagal diperbarui. Coba lagi.'))
      return
    }
    setData((previous) => ({ ...previous, rooms: previous.rooms.map((item) => item.id === roomId ? { ...item, isArchived } : item) }))
    if (isArchived) setBookingRoom((current) => current === roomId
      ? data.rooms.find((item) => item.id !== roomId && !item.isArchived)?.id ?? ''
      : current)
    announce(isArchived ? `Ruangan ${room.name} diarsipkan. Riwayat booking tetap tersimpan.` : `Ruangan ${room.name} dipulihkan dari arsip.`)
  }

  async function deleteRoom(roomId: string) {
    if (!supabase) return
    const room = data.rooms.find((item) => item.id === roomId)
    if (!room) return
    if (!window.confirm(`Hapus permanen ${room.name} (${room.code})? Semua riwayat booking ruangan ini akan ikut dihapus. Tindakan ini tidak dapat dibatalkan.`)) return

    const { error } = await supabase.from('rooms').delete().eq('id', roomId)
    if (error) {
      announce(`Ruangan ${room.name} tidak dapat dihapus permanen. ${formatActionError(error, 'Coba lagi. Jika tetap gagal, pastikan tidak ada laporan terbuka atau booking aktif.')}`)
      return
    }

    setData((previous) => ({
      ...previous,
      rooms: previous.rooms.filter((item) => item.id !== roomId),
      bookings: previous.bookings.filter((booking) => booking.roomId !== roomId),
      tickets: previous.tickets.map((ticket) => ticket.roomId === roomId ? { ...ticket, roomId: null, roomName: null } : ticket),
    }))
    setInventoryItems((previous) => previous.filter((item) => item.roomId !== roomId))
    setBookingRoom((current) => current === roomId ? '' : current)
    announce(`Ruangan ${room.name} beserta riwayat bookingnya berhasil dihapus permanen.`)
  }

  async function updateRoom(roomId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const code = String(form.get('code') ?? '').trim()
    const location = String(form.get('location') ?? '').trim()
    const capacity = Number(form.get('capacity'))
    const facilities = String(form.get('facilities') ?? '').trim()
    if (!name || !code || !location || !Number.isInteger(capacity) || capacity < 1) {
      announce('Isi nama, kode, lokasi, dan kapasitas ruangan yang valid.')
      return false
    }
    const conflictingBooking = data.bookings.find((booking) =>
      booking.roomId === roomId && ACTIVE_BOOKING_STATUSES.has(booking.status)
      && booking.requestedCapacity > capacity
      && new Date(`${booking.date}T${booking.end}:00`).getTime() > Date.now(),
    )
    if (conflictingBooking) {
      announce(`Kapasitas tidak dapat dikurangi. Booking ${formatDate(conflictingBooking.date)} masih membutuhkan ${conflictingBooking.requestedCapacity} orang.`)
      return false
    }
    if (!supabase) return false
    const { data: saved, error } = await supabase.from('rooms').update({
      name, code, location, capacity, facilities: facilities || null, updated_at: new Date().toISOString(),
    }).eq('id', roomId).select('*').single()
    if (error) {
      announce(error.code === '23505'
        ? 'Kode ruangan sudah dipakai. Gunakan kode yang berbeda.'
        : formatActionError(error, 'Perubahan data ruangan gagal disimpan. Periksa kembali data lalu coba lagi.'))
      return false
    }
    setData((previous) => ({ ...previous, rooms: previous.rooms.map((room) => room.id === roomId ? {
      ...room, name: saved.name, code: saved.code, location: saved.location, capacity: saved.capacity,
      facilities: saved.facilities ?? 'Belum dicantumkan.',
    } : room) }))
    announce(`Data ruangan ${saved.name} berhasil diperbarui.`)
    return true
  }

  async function addRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const code = String(form.get('code') ?? '').trim()
    const location = String(form.get('location') ?? '').trim()
    const capacity = Number(form.get('capacity'))
    const facilities = String(form.get('facilities') ?? '').trim()
    if (!name || !code || !location || !Number.isInteger(capacity) || capacity < 1) {
      announce('Lengkapi nama, kode, lokasi, dan kapasitas ruangan yang valid.')
      return
    }
    if (!supabase) return
    const { data: saved, error } = await supabase.from('rooms').insert({ code, name, location, capacity, status: 'tentatif', facilities: facilities || null }).select('*').single()
    if (error) {
      announce(error.code === '23505'
        ? 'Kode ruangan sudah dipakai. Gunakan kode yang berbeda.'
        : formatActionError(error, 'Ruangan gagal ditambahkan. Periksa kembali data lalu coba lagi.'))
      return
    }
    const room: Room = {
      id: saved.id, code: saved.code, name: saved.name, location: saved.location, capacity: saved.capacity,
      status: 'tentatif', isArchived: false, occupiedFrom: saved.occupied_from, occupiedUntil: saved.occupied_until, facilities: saved.facilities ?? 'Belum dicantumkan.',
    }
    setData((previous) => ({ ...previous, rooms: [...previous.rooms, room] }))
    event.currentTarget.reset()
    announce('Ruangan berhasil ditambahkan dengan status tentatif.')
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

  async function handleRecommendationPdf(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0] ?? null
    if (!file) {
      setRecommendationPdf(null)
      return
    }
    if (file.size > 3 * 1024 * 1024) {
      setRecommendationPdf(null)
      input.value = ''
      announce('Ukuran PDF rekomendasi maksimal 3 MB.')
      return
    }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setRecommendationPdf(null)
      input.value = ''
      announce('Pilih file PDF untuk laporan rekomendasi.')
      return
    }
    if (await file.slice(0, 5).text() !== '%PDF-') {
      setRecommendationPdf(null)
      input.value = ''
      announce('File yang dipilih bukan dokumen PDF yang valid.')
      return
    }
    setRecommendationPdf(file)
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

  const heading = view === 'reviews' ? reviewLabel : currentView?.label ?? 'Ringkasan'
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
              {id === 'reviews' && reviewCount > 0 && (
                <span className="nav-count">{reviewCount}</span>
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
                  onDeleteTickets={deleteTickets}
                  onOpenPhoto={openTicketPhoto}
                  onReadReport={readSarprasReport}
                />
              )}
              {view === 'new-ticket' && role === 'guru' && (
                <NewTicketView rooms={data.rooms} inventoryItems={inventoryItems} photo={photo} onPhotoChange={handlePhoto} onSubmit={submitTicket} />
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
                  onDeleteBookings={deleteBookings}
                  onReadLetter={readBookingLetter}
                  onReadReport={readSarprasReport}
                />
              )}
              {view === 'dataset' && <DatasetView role={role} rooms={data.rooms} inventoryItems={inventoryItems} onAddItem={addInventoryItem} onUpdateQuantity={updateInventoryQuantity} onArchiveItem={archiveInventoryItem} />}
              {view === 'reviews' && isReviewer && (
                <ReviewView
                  role={role}
                  tickets={data.tickets}
                  bookings={data.bookings}
                  rooms={data.rooms}
                  onTicketUpdate={updateTicket}
                  onBookingUpdate={updateBooking}
                  onReadLetter={readBookingLetter}
                  onReadReport={readSarprasReport}
                  onPrepareTicketReport={prepareTicketRecommendation}
                  onPrepareBookingReport={prepareBookingRecommendation}
                  onOpenPhoto={openTicketPhoto}
                />
              )}
              {view === 'rooms' && (role === 'admin' || role === 'sarpras') && (
                <RoomsView
                  rooms={data.rooms}
                  now={now}
                  onToggle={toggleRoom}
                  onAdd={addRoom}
                  onUpdateRoom={updateRoom}
                  onDelete={deleteRoom}
                  onSetArchived={setRoomArchived}
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
        <section className="document-dialog" role="dialog" aria-modal="true" aria-label={`Pratinjau PDF: ${openDocument.name}`}>
          <header><div><FileText size={18} /><strong>{openDocument.name}</strong></div><button className="icon-button" onClick={() => setOpenDocument(null)} aria-label="Tutup pratinjau PDF"><X size={18} /></button></header>
          <iframe src={openDocument.url} title={`Pratinjau PDF ${openDocument.name}`} />
        </section>
      </div>}
      {openPhoto && <div className="document-overlay photo-overlay" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpenPhoto(null)
      }}>
        <section className="photo-dialog" role="dialog" aria-modal="true" aria-label={`Foto kerusakan: ${openPhoto.name}`}>
          <header><div><ImagePlus size={18} /><strong>{openPhoto.name}</strong></div><button className="icon-button photo-dialog-close" onClick={() => setOpenPhoto(null)} aria-label="Tutup foto"><X size={18} /></button></header>
          <div className="photo-dialog-image"><Image src={openPhoto.url} alt={`Foto kerusakan ${openPhoto.name}`} width={1600} height={1200} unoptimized /></div>
        </section>
      </div>}
      {recommendationDraft && <div className="document-overlay report-overlay" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget && !recommendationSubmitting) setRecommendationDraft(null)
      }}>
        <section className="recommendation-dialog" role="dialog" aria-modal="true" aria-labelledby="recommendation-title">
          <header><div><FileText size={18} /><strong id="recommendation-title">Siapkan laporan rekomendasi</strong></div><button className="icon-button" onClick={() => setRecommendationDraft(null)} disabled={recommendationSubmitting} aria-label="Tutup formulir"><X size={18} /></button></header>
          <form onSubmit={submitRecommendation}>
            <div className="recommendation-context"><strong>{recommendationDraft.title} · {recommendationDraft.reference}</strong>{recommendationDraft.details.map((detail) => <p key={detail}>{detail}</p>)}</div>
            <fieldset className="recommendation-method">
              <legend>Pilih cara menyiapkan laporan <b>*</b></legend>
              <label className={`recommendation-method-option${recommendationMode === 'text' ? ' is-selected' : ''}`}>
                <input type="radio" name="recommendation-method" value="text" checked={recommendationMode === 'text'} onChange={() => setRecommendationMode('text')} />
                <span><strong>Tulis rekomendasi</strong><small>Catatan dibuat menjadi PDF.</small></span>
              </label>
              <label className={`recommendation-method-option${recommendationMode === 'upload' ? ' is-selected' : ''}`}>
                <input type="radio" name="recommendation-method" value="upload" checked={recommendationMode === 'upload'} onChange={() => setRecommendationMode('upload')} />
                <span><strong>Unggah PDF yang sudah dibuat</strong><small>Teruskan dokumen yang sudah tersedia.</small></span>
              </label>
            </fieldset>
            {recommendationMode === 'text' ? (
              <label className="field"><span>Hasil pemeriksaan dan rekomendasi Sarpras <b>*</b></span><textarea autoFocus rows={7} value={recommendationText} onChange={(event) => setRecommendationText(event.target.value)} placeholder="Tuliskan kondisi yang ditemukan, tindakan yang disarankan, dan catatan untuk Kepala Sekolah." required /></label>
            ) : (
              <div className="field">
                <span>File PDF rekomendasi <b>*</b></span>
                <label className="upload-control recommendation-upload">
                  <FileText size={17} aria-hidden="true" />
                  <span>{recommendationPdf?.name ?? 'Pilih file PDF, maksimal 3 MB'}</span>
                  <input type="file" accept="application/pdf,.pdf" onChange={handleRecommendationPdf} disabled={recommendationSubmitting} />
                </label>
                <small className="recommendation-upload-help">PDF akan disimpan secara privat dan dibaca oleh Kepala Sekolah.</small>
              </div>
            )}
            <p className="form-note"><FileText size={16} />{recommendationMode === 'text' ? 'Catatan akan disimpan dan dibuat menjadi PDF privat untuk dibaca Kepala Sekolah.' : 'PDF yang diunggah akan disimpan secara privat untuk dibaca Kepala Sekolah.'}</p>
            <div className="form-footer"><span>{recommendationMode === 'text' ? 'Catatan pemeriksaan akan dibuat menjadi PDF.' : 'PDF terpilih akan langsung diteruskan.'}</span><button className="button button-primary" type="submit" disabled={recommendationSubmitting || (recommendationMode === 'text' ? !recommendationText.trim() : !recommendationPdf)}><FileText size={15} />{recommendationSubmitting ? 'Menyimpan dan meneruskan…' : 'Teruskan kepada Kepala Sekolah'}</button></div>
          </form>
        </section>
      </div>}
      {notice && <div className={`toast${noticeIsError ? ' toast-error' : ''}`} role={noticeIsError ? 'alert' : 'status'}>
        {noticeIsError ? <X size={17} aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}{notice}
      </div>}
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
  const availableRoomCount = rooms.filter((room) => !room.isArchived && room.status === 'tersedia').length

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
            <p>Periksa usulan, verifikasi kondisi di lapangan, kirim rekomendasi, dan kelola data ruangan.</p>
          </div>
          <div className="admin-banner-actions">
            <button className="button button-primary" onClick={() => onNavigate('reviews')}>Buka tinjauan <ArrowRight size={16} /></button>
            <button className="button button-quiet" onClick={() => onNavigate('rooms')}>Kelola ruangan <Building2 size={16} /></button>
          </div>
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
              <p>Jam penggunaan sekolah: Senin sampai Minggu, 07.00–16.00</p>
            </div>
          </div>
          {rooms.filter((room) => !room.isArchived).map((room) => {
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
  onDeleteTickets,
  onOpenPhoto,
  onReadReport,
}: {
  role: Role
  tickets: Ticket[]
  onNavigate: (view: View) => void
  onDeleteTickets: (ids: string[]) => Promise<boolean>
  onOpenPhoto: (name: string, url: string) => void
  onReadReport: (path: string | null, name: string) => void
}) {
  const shown = role === 'guru' ? tickets : tickets
  const isAdmin = role === 'admin'
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([])
  const [deletingTickets, setDeletingTickets] = useState(false)
  const allTicketsSelected = shown.length > 0 && shown.every((ticket) => selectedTicketIds.includes(ticket.id))
  const visibleSelectedTicketIds = selectedTicketIds.filter((id) => shown.some((ticket) => ticket.id === id))

  function toggleTicketSelection(ticketId: string) {
    setSelectedTicketIds((current) => current.includes(ticketId)
      ? current.filter((id) => id !== ticketId)
      : [...current, ticketId])
  }

  function toggleAllTicketSelection() {
    setSelectedTicketIds((current) => allTicketsSelected
      ? current.filter((id) => !shown.some((ticket) => ticket.id === id))
      : [...new Set([...current, ...shown.map((ticket) => ticket.id)])])
  }

  async function deleteSelectedTickets() {
    if (visibleSelectedTicketIds.length === 0 || deletingTickets) return
    if (!window.confirm(`Hapus ${visibleSelectedTicketIds.length} laporan kerusakan yang dipilih? Tindakan ini tidak dapat dibatalkan.`)) return
    setDeletingTickets(true)
    try {
      const deleted = await onDeleteTickets(visibleSelectedTicketIds)
      if (deleted) setSelectedTicketIds((current) => current.filter((id) => !visibleSelectedTicketIds.includes(id)))
    } finally {
      setDeletingTickets(false)
    }
  }

  return (
    <div className="page-stack">
      <PageIntro
        title="Laporan kerusakan"
        description="Catat kerusakan fasilitas dan ikuti tahap pemeriksaannya sampai selesai."
        action={role === 'guru' ? <button className="button button-primary" onClick={() => onNavigate('new-ticket')}><Plus size={16} />Buat laporan</button> : undefined}
      />
      {isAdmin && shown.length > 0 && <div className="ticket-bulk-actions">
        <label className="booking-select-control"><input type="checkbox" checked={allTicketsSelected} onChange={toggleAllTicketSelection} aria-label="Pilih semua laporan kerusakan" /><span>Pilih semua laporan</span></label>
        <button className="button button-danger" onClick={deleteSelectedTickets} disabled={visibleSelectedTicketIds.length === 0 || deletingTickets}><Trash2 size={15} />{deletingTickets ? 'Menghapus…' : `Hapus terpilih${visibleSelectedTicketIds.length > 0 ? ` (${visibleSelectedTicketIds.length})` : ''}`}</button>
      </div>}
      {shown.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Belum ada laporan kerusakan" description={role === 'guru' ? 'Buat laporan jika menemukan fasilitas yang perlu diperbaiki.' : 'Laporan yang dikirim Guru atau Wali Kelas akan tampil di sini.'} />
      ) : (
        <div className="ticket-list">
          {shown.map((ticket) => {
            return (
              <article className="panel ticket-card" key={ticket.id}>
                <div className="ticket-card-main">
                  <div className="ticket-number-line">{isAdmin && <label className="ticket-select-control"><input type="checkbox" checked={selectedTicketIds.includes(ticket.id)} onChange={() => toggleTicketSelection(ticket.id)} aria-label={`Pilih laporan ${ticket.number}`} /><span>Pilih</span></label>}<span>{ticket.number}</span><span className={statusClass(ticket.status)}>{TICKET_LABELS[ticket.status]}</span>{ticket.status === 'menunggu_kepsek' && <span className="status status-green">Direkomendasikan Sarana Prasarana</span>}</div>
                  <h3>{ticket.title}</h3>
                  <p>{ticket.equipment} · Jumlah rusak: {ticket.damagedQuantity ?? '–'} · {ticket.roomName ?? ticket.location}</p>

                  <p className="ticket-description">{ticket.description}</p>
                  <div className="ticket-meta"><span>{ticket.category}</span>{ticket.damageSeverity && <span>Tingkat kerusakan: {DAMAGE_SEVERITY_LABELS[ticket.damageSeverity]}</span>}<span>{formatShortDate(ticket.createdAt)}</span>{ticket.photoName && <span className="photo-label"><ImagePlus size={13} /> Foto terlampir</span>}</div>
                  {(ticket.photoData || ticket.status === 'ditolak') && <div className={`ticket-evidence-row${ticket.photoData ? '' : ' ticket-evidence-row-no-photo'}`}>
                    {ticket.photoData && <figure className="ticket-photo-frame"><button className="ticket-photo-button" onClick={() => onOpenPhoto(ticket.equipment, ticket.photoData!)} aria-label={`Buka foto kerusakan ${ticket.equipment} dalam ukuran penuh`}><Image className="ticket-photo" src={ticket.photoData} alt={`Dokumentasi ${ticket.equipment}`} width={480} height={320} unoptimized /></button><figcaption className="ticket-photo-caption"><ImagePlus size={14} aria-hidden="true" />Foto bukti kerusakan <span>· Pilih untuk melihat ukuran penuh</span></figcaption></figure>}
                    {ticket.status === 'ditolak' && <div className="ticket-rejection-panel"><span className="ticket-rejection-label">Alasan penolakan</span><strong>Ditolak pada tahap {TICKET_LABELS[ticket.rejectionStage && ticket.rejectionStage !== 'ditolak' ? ticket.rejectionStage : 'menunggu_kepsek']}.</strong><p>{ticket.rejectionNote || 'Alasan belum dicatat.'}</p></div>}
                  </div>}
                  {ticket.sarprasReportPath && <button className="text-button report-link" onClick={() => onReadReport(ticket.sarprasReportPath ?? null, `Laporan Sarpras ${ticket.number}.pdf`)}><FileText size={14} />Baca laporan rekomendasi PDF</button>}
                  <TicketProgress status={ticket.status} rejectionStage={ticket.rejectionStage} />
                </div>
                <div className="ticket-card-side">
                  <div className="ticket-requester"><span>Pengaju</span><strong>{ticket.requesterName}</strong></div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TicketProgress({ status, rejectionStage }: {
  status: TicketStatus
  rejectionStage?: TicketStatus | null
}) {
  const rejectedIndex = status === 'ditolak'
    ? Math.max(0, TICKET_STEPS.indexOf(rejectionStage ?? 'menunggu_kepsek'))
    : -1
  const currentIndex = TICKET_STEPS.indexOf(status)
  return (
    <>
      <div className="progress-track" aria-label={`Tahap laporan: ${status === 'ditolak' ? `ditolak saat ${TICKET_LABELS[TICKET_STEPS[rejectedIndex]]}` : TICKET_LABELS[status]}`}>
        {TICKET_STEPS.map((step, index) => {
          const rejected = status === 'ditolak' && index >= rejectedIndex
          const complete = status === 'ditolak' ? index < rejectedIndex : index <= currentIndex
          return <div className={`progress-step ${complete ? 'progress-step-done' : ''} ${rejected ? 'progress-step-rejected' : ''}`} key={step}>
            <span className="progress-dot">{rejected && index === rejectedIndex ? <X size={10} /> : complete ? <Check size={10} /> : index + 1}</span>
            <span>{TICKET_LABELS[step]}</span>
          </div>
        })}
      </div>
    </>
  )
}

function NewTicketView({
  rooms,
  inventoryItems,
  photo,
  onPhotoChange,
  onSubmit,
}: {
  rooms: Room[]
  inventoryItems: InventoryItem[]
  photo: { name: string; data: string } | null
  onPhotoChange: (event: ChangeEvent<HTMLInputElement>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const [selectedRoomId, setSelectedRoomId] = useState(rooms[0]?.id ?? '')
  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState('')
  const [damagedQuantity, setDamagedQuantity] = useState('1')
  const activeRoomId = rooms.some((room) => room.id === selectedRoomId) ? selectedRoomId : rooms[0]?.id ?? ''
  const roomItems = inventoryItems.filter((item) => item.roomId === activeRoomId && item.isActive)
  const selectedItem = roomItems.find((item) => item.id === selectedInventoryItemId)
  const isOther = selectedInventoryItemId === 'other'
  const availableQuantity = selectedItem?.quantity === null || !selectedItem
    ? 0
    : Math.max(0, selectedItem.quantity - selectedItem.activeDamagedQuantity)


  return (
    <div className="page-stack narrow-page">
      <PageIntro title="Buat laporan kerusakan" description="Pilih ruangan dan barang yang rusak agar jumlahnya tercatat di dataset." />
      <form className="panel form-panel" onSubmit={onSubmit}>
        <div className="form-grid">
          <label className="field field-full">
            <span>Ruangan <b>*</b></span>
            <select name="roomId" value={activeRoomId} onChange={(event) => {
              setSelectedRoomId(event.target.value)
              setSelectedInventoryItemId('')
              setDamagedQuantity('1')
            }} required>
              <option value="" disabled>Pilih ruangan</option>
              {rooms.filter((room) => !room.isArchived).map((room) => <option value={room.id} key={room.id}>{room.name}</option>)}
            </select>
          </label>
          <label className="field field-full">
            <span>Barang atau fasilitas rusak <b>*</b></span>
            <select name="inventoryItemId" value={selectedInventoryItemId} onChange={(event) => {
              setSelectedInventoryItemId(event.target.value)
              setDamagedQuantity('1')
            }} required>
              <option value="" disabled>Pilih barang dari dataset</option>
              {roomItems.map((item) => {
                const available = item.quantity === null ? 0 : Math.max(0, item.quantity - item.activeDamagedQuantity)
                return <option value={item.id} key={item.id} disabled={available === 0}>
                  {item.name} · tersedia {available}
                </option>
              })}
              <option value="other">Lainnya</option>
            </select>
          </label>
          {isOther && <label className="field field-full">
            <span>Nama barang lainnya <b>*</b></span>
            <input name="otherEquipment" placeholder="Contoh: genteng bocor" required />
          </label>}

          <label className="field field-full">
            <span>Jumlah rusak <b>*</b></span>
            <input name="damagedQuantity" type="number" min="1" step="1" max={selectedItem ? availableQuantity : undefined}
              value={damagedQuantity} onChange={(event) => setDamagedQuantity(event.target.value)} required />
            <small>{selectedItem ? `Stok tersedia untuk dilaporkan: ${availableQuantity} unit.` : isOther ? 'Barang ini dicatat pada laporan, tanpa mengubah stok dataset.' : 'Pilih barang terlebih dahulu.'}</small>
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
  onDeleteBookings,
  onReadLetter,
  onReadReport,
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
  onDeleteBookings: (ids: string[]) => Promise<boolean>
  onReadLetter: (booking: Booking) => void
  onReadReport: (path: string | null, name: string) => void
}) {
  const canRequest = role === 'guru'
  const isAdmin = role === 'admin'
  const [selectedBookingIds, setSelectedBookingIds] = useState<string[]>([])
  const [deletingBookings, setDeletingBookings] = useState(false)
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
  const allBookingsSelected = userBookings.length > 0 && userBookings.every((booking) => selectedBookingIds.includes(booking.id))
  const visibleSelectedBookingIds = selectedBookingIds.filter((id) => userBookings.some((booking) => booking.id === id))

  function toggleBookingSelection(bookingId: string) {
    setSelectedBookingIds((current) => current.includes(bookingId)
      ? current.filter((id) => id !== bookingId)
      : [...current, bookingId])
  }

  function toggleAllBookingSelection() {
    setSelectedBookingIds((current) => allBookingsSelected
      ? current.filter((id) => !userBookings.some((booking) => booking.id === id))
      : [...new Set([...current, ...userBookings.map((booking) => booking.id)])])
  }

  async function deleteSelectedBookings() {
    if (visibleSelectedBookingIds.length === 0 || deletingBookings) return
    const confirmed = window.confirm(`Hapus ${visibleSelectedBookingIds.length} riwayat booking yang dipilih? Tindakan ini tidak dapat dibatalkan.`)
    if (!confirmed) return
    setDeletingBookings(true)
    try {
      const deleted = await onDeleteBookings(visibleSelectedBookingIds)
      if (deleted) setSelectedBookingIds((current) => current.filter((id) => !visibleSelectedBookingIds.includes(id)))
    } finally {
      setDeletingBookings(false)
    }
  }

  return (
    <div className="page-stack">
      <PageIntro title="Booking ruangan" description="Pilih ruangan dan waktu yang tersedia. Permintaan akan direkomendasikan Wakasek Sarpras sebelum diputuskan Kepala Sekolah." />
      <div className="booking-layout">
        <section className="panel booking-form-panel">
          <div className="panel-heading panel-heading-spaced">
            <div><h3>Ajukan penggunaan ruangan</h3><p>Jadwal operasional sekolah: Senin sampai Minggu, 07.00–16.00.</p></div>
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
          {!dateIsValid(bookingDate) && <div className="inline-warning">Pilih tanggal booking yang valid.</div>}
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
        <div className="panel-heading"><div><h3>{canRequest ? 'Pengajuan saya' : 'Daftar pengajuan booking'}</h3><p>Status rekomendasi, persetujuan, dan dokumen booking</p></div>{isAdmin && userBookings.length > 0 && <button className="button button-danger" onClick={deleteSelectedBookings} disabled={visibleSelectedBookingIds.length === 0 || deletingBookings}><Trash2 size={15} />{deletingBookings ? 'Menghapus…' : `Hapus terpilih${visibleSelectedBookingIds.length > 0 ? ` (${visibleSelectedBookingIds.length})` : ''}`}</button>}</div>
        {userBookings.length === 0 ? (
          <EmptyState icon={CalendarDays} title="Belum ada pengajuan booking" description="Permintaan booking akan muncul setelah diajukan." />
        ) : (
          <div className="table-wrap"><table><thead><tr><th>Ruangan</th><th>Pengaju</th><th>Tanggal</th><th>Waktu</th><th>Keperluan</th><th>Status</th>{isAdmin && <th><label className="booking-select-control"><input type="checkbox" checked={allBookingsSelected} onChange={toggleAllBookingSelection} aria-label="Pilih semua pengajuan booking" /><span>Pilih</span></label></th>}<th>PDF</th>{canRequest && <th></th>}</tr></thead>
            <tbody>{userBookings.map((booking) => {
              const room = rooms.find((item) => item.id === booking.roomId)
              return <tr key={booking.id}>
                <td><strong>{room?.name ?? 'Ruangan tidak ditemukan'}</strong><small>{room?.location}</small></td>
                <td>{booking.requester}</td>
                <td>{formatDate(booking.date)}</td>
                <td>{booking.start}–{booking.end}</td>
                <td>{booking.purpose}<small>{booking.requestedCapacity} orang · {booking.letterName ?? 'Surat belum dilampirkan'}</small></td>
                <td><span className={statusClass(booking.status)}>{BOOKING_LABELS[booking.status]}</span>{booking.status === 'menunggu_kepsek' && <small className="recommendation-status">Direkomendasikan Sarana Prasarana</small>}{booking.status === 'ditolak' && booking.rejectionNote && <small className="rejection-note">Ditolak pada tahap {booking.rejectionStage ? BOOKING_LABELS[booking.rejectionStage] : 'persetujuan Kepala Sekolah'}: {booking.rejectionNote}</small>}</td>
                {isAdmin && <td className="booking-select-cell"><label><input type="checkbox" checked={selectedBookingIds.includes(booking.id)} onChange={() => toggleBookingSelection(booking.id)} aria-label={`Pilih booking ${booking.requester}, ${formatDate(booking.date)} pukul ${booking.start}`} /></label></td>}
                <td><div className="pdf-actions">{booking.letterId && <button className="table-action" onClick={() => onReadLetter(booking)}>Surat PDF</button>}{booking.sarprasReportPath && <button className="table-action" onClick={() => onReadReport(booking.sarprasReportPath ?? null, `Laporan Sarpras ${room?.name ?? 'booking'}.pdf`)}>Laporan Sarpras</button>}{!booking.letterId && !booking.sarprasReportPath && <span>Belum ada</span>}</div></td>
                {canRequest && <td>{['diajukan_sarpras', 'menunggu_kepsek'].includes(booking.status) && <button className="table-action table-action-danger" onClick={() => onCancel(booking.id)}>Batalkan</button>}</td>}
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

function DatasetView({ role, rooms, inventoryItems, onAddItem, onUpdateQuantity, onArchiveItem }: {
  role: Role
  rooms: Room[]
  inventoryItems: InventoryItem[]
  onAddItem: (roomId: string, name: string, quantity: number) => Promise<boolean>
  onUpdateQuantity: (itemId: string, quantity: number) => Promise<boolean>
  onArchiveItem: (itemId: string) => Promise<boolean>
}) {
  const [selectedRoom, setSelectedRoom] = useState('all')
  const [newRoomId, setNewRoomId] = useState(rooms[0]?.id ?? '')
  const [newItemName, setNewItemName] = useState('')
  const [newItemQuantity, setNewItemQuantity] = useState('1')
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({})
  const [savingItemId, setSavingItemId] = useState<string | null>(null)
  const [addingItem, setAddingItem] = useState(false)
  const isManager = role === 'admin' || role === 'sarpras'
  const visibleRooms = selectedRoom === 'all' ? rooms : rooms.filter((room) => room.id === selectedRoom)
  const activeRooms = rooms.filter((room) => !room.isArchived)
  const activeNewRoomId = activeRooms.some((room) => room.id === newRoomId) ? newRoomId : activeRooms[0]?.id ?? ''

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = newItemName.trim()
    const quantity = Number(newItemQuantity)
    if (!activeNewRoomId || !name || !Number.isInteger(quantity) || quantity < 0) return
    setAddingItem(true)
    try {
      if (await onAddItem(activeNewRoomId, name, quantity)) {
        setNewItemName('')
        setNewItemQuantity('1')
      }
    } finally {
      setAddingItem(false)
    }
  }

  async function saveQuantity(item: InventoryItem, quantity: number) {
    if (!Number.isInteger(quantity) || quantity < item.activeDamagedQuantity || savingItemId) return
    setSavingItemId(item.id)
    try {
      if (await onUpdateQuantity(item.id, quantity)) {
        setQuantityDrafts((current) => {
          const next = { ...current }
          delete next[item.id]
          return next
        })
      }
    } finally {
      setSavingItemId(null)
    }
  }

  async function removeItem(item: InventoryItem, roomName: string) {
    if (savingItemId || !window.confirm(`Hapus ${item.name} dari dataset ${roomName}? Laporan lama tetap tersimpan.`)) return
    setSavingItemId(item.id)
    try {
      await onArchiveItem(item.id)
    } finally {
      setSavingItemId(null)
    }
  }

  return (
    <div className="page-stack">
      <PageIntro title="Dataset" description="Lihat jumlah barang dan jumlah rusak aktif per ruangan." />
      <section className="panel dataset-panel">
        <div className="dataset-toolbar">
          <h3>Dataset barang per ruangan</h3>
          <label className="dataset-filter">
            <span>Ruangan</span>
            <select value={selectedRoom} onChange={(event) => setSelectedRoom(event.target.value)}>
              <option value="all">Semua ruangan</option>
              {rooms.map((room) => <option value={room.id} key={room.id}>{room.name}</option>)}
            </select>
          </label>
        </div>

        {isManager && <form className="dataset-add-form" onSubmit={addItem}>
          <label className="field">
            <span>Ruangan</span>
            <select value={activeNewRoomId} onChange={(event) => setNewRoomId(event.target.value)} required>
              <option value="" disabled>Pilih ruangan</option>
              {activeRooms.map((room) => <option value={room.id} key={room.id}>{room.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Nama barang atau fasilitas</span>
            <span>Nama barang</span>
            <input value={newItemName} onChange={(event) => setNewItemName(event.target.value)} maxLength={120} required />
          </label>
          <label className="field">
            <span>Qty</span>
            <input type="number" min="0" step="1" value={newItemQuantity} onChange={(event) => setNewItemQuantity(event.target.value)} required />
          </label>
          <button className="button button-primary" type="submit" disabled={addingItem || rooms.length === 0}><Plus size={15} />Tambah barang</button>
        </form>}

        <div className="dataset-room-list">
          {visibleRooms.map((room) => {
            const roomItems = inventoryItems.filter((item) => item.roomId === room.id && item.isActive)
            return <section className="dataset-room" key={room.id} aria-labelledby={`dataset-${room.id}`}>
              <h3 id={`dataset-${room.id}`}>{room.name}</h3>
              {roomItems.length === 0 ? <p className="dataset-empty">Belum ada barang di dataset ruangan ini.</p> : (
                <div className="table-wrap">
                  <table className={`dataset-table${isManager ? ' dataset-table-managed' : ''}`} aria-label={`Dataset ${room.name}`}>
                    <thead><tr><th scope="col">Nama barang</th><th scope="col">Qty</th><th scope="col">Jumlah rusak</th>{isManager && <th scope="col">Kelola</th>}</tr></thead>
                    <tbody>{roomItems.map((item) => {
                      const quantityValue = quantityDrafts[item.id] ?? String(item.quantity ?? 0)
                      const parsedQuantity = Number(quantityValue)
                      const quantityChanged = parsedQuantity !== item.quantity
                      const quantityValid = Number.isInteger(parsedQuantity) && parsedQuantity >= item.activeDamagedQuantity
                      return <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{isManager ? <input className="dataset-quantity-input" aria-label={`Qty ${item.name}`} type="number" min={item.activeDamagedQuantity} step="1" value={quantityValue} onChange={(event) => setQuantityDrafts((current) => ({ ...current, [item.id]: event.target.value }))} /> : item.quantity ?? ''}</td>
                        <td>{item.activeDamagedQuantity > 0 ? <span className="dataset-damaged-count">{item.activeDamagedQuantity}</span> : ''}</td>
                        {isManager && <td><div className="dataset-item-actions">
                          <button className="table-action" type="button" disabled={!quantityChanged || !quantityValid || savingItemId !== null} onClick={() => saveQuantity(item, parsedQuantity)}>{savingItemId === item.id ? 'Menyimpan…' : 'Simpan'}</button>
                          <button className="table-action table-action-danger" type="button" disabled={savingItemId !== null || item.activeDamagedQuantity > 0} title={item.activeDamagedQuantity > 0 ? 'Selesaikan laporan kerusakan aktif sebelum menghapus barang.' : undefined} onClick={() => removeItem(item, room.name)}>Hapus</button>
                        </div></td>}
                      </tr>
                    })}</tbody>
                  </table>
                </div>
              )}
            </section>
          })}
        </div>
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
  onReadReport,
  onPrepareTicketReport,
  onPrepareBookingReport,
  onOpenPhoto,
}: {
  role: Role
  tickets: Ticket[]
  bookings: Booking[]
  rooms: Room[]
  onTicketUpdate: (id: string, status: TicketStatus, damageSeverity?: DamageSeverity) => void
  onBookingUpdate: (id: string, status: BookingStatus) => void
  onReadLetter: (booking: Booking) => void
  onReadReport: (path: string | null, name: string) => void
  onPrepareTicketReport: (ticket: Ticket) => void
  onPrepareBookingReport: (booking: Booking) => void
  onOpenPhoto: (name: string, url: string) => void
}) {
  const [severityDrafts, setSeverityDrafts] = useState<Record<string, DamageSeverity | ''>>({})
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
            const canReject = role === 'sarpras' && ['diajukan', 'verifikasi_sarpras', 'verifikasi_lapangan'].includes(ticket.status)
            const selectedSeverity = severityDrafts[ticket.id] ?? ticket.damageSeverity ?? ''
            return <article className="review-item" key={ticket.id}>
              <div className="review-item-copy">
                <div className="ticket-number-line"><span>{ticket.number}</span><span className={statusClass(ticket.status)}>{TICKET_LABELS[ticket.status]}</span>{ticket.status === 'menunggu_kepsek' && <span className="status status-green">Direkomendasikan Sarana Prasarana</span>}</div>
                <h4>{ticket.title}</h4><p>{ticket.equipment} · Jumlah rusak: {ticket.damagedQuantity ?? '–'} · {ticket.roomName ?? ticket.location}</p><p>{ticket.description}</p>
                {ticket.photoData && <button className="ticket-photo-button" onClick={() => onOpenPhoto(ticket.equipment, ticket.photoData!)} aria-label={`Buka foto kerusakan ${ticket.equipment}`}><Image className="ticket-photo" src={ticket.photoData} alt={`Dokumentasi ${ticket.equipment}`} width={220} height={150} unoptimized /></button>}
              </div>
              <div className="review-item-side">
                <div className="review-item-meta">
                  <div><span>Pengaju</span><strong>{ticket.requesterName}</strong></div>
                  {ticket.damageSeverity && <div><span>Tingkat kerusakan</span><strong className="review-severity-value">{DAMAGE_SEVERITY_LABELS[ticket.damageSeverity]}</strong></div>}
                </div>
                <div className="review-item-actions review-ticket-actions">
                  {role === 'sarpras' && action && <>
                    {action.next === 'verifikasi_sarpras' && <label className="severity-select-field">
                      <span>Tingkat kerusakan</span>
                      <select aria-label={`Tingkat kerusakan laporan ${ticket.number}`} value={selectedSeverity} onChange={(event) => setSeverityDrafts((current) => ({ ...current, [ticket.id]: event.target.value as DamageSeverity | '' }))}>
                        <option value="">Pilih tingkat</option>
                        <option value="ringan">Ringan</option>
                        <option value="sedang">Sedang</option>
                        <option value="berat">Berat</option>
                      </select>
                    </label>}
                    <button className="button button-primary" disabled={action.next === 'verifikasi_sarpras' && !selectedSeverity} onClick={() => action.next === 'menunggu_kepsek' ? onPrepareTicketReport(ticket) : onTicketUpdate(ticket.id, action.next, action.next === 'verifikasi_sarpras' ? selectedSeverity || undefined : undefined)}>{action.label}<ArrowRight size={15} /></button>
                  </>}
                  {canReject && <button className="button button-quiet" onClick={() => onTicketUpdate(ticket.id, 'ditolak')}><X size={15} />Tolak</button>}
                  {role === 'kepsek' && <>{ticket.sarprasReportPath && <button className="button button-quiet" onClick={() => onReadReport(ticket.sarprasReportPath ?? null, `Laporan Sarpras ${ticket.number}.pdf`)}><FileText size={15} />Laporan rekomendasi Sarana Prasarana</button>}<button className="button button-primary" onClick={() => onTicketUpdate(ticket.id, 'proses_perbaikan')}><Check size={15} />Setujui perbaikan</button><button className="button button-quiet" onClick={() => onTicketUpdate(ticket.id, 'ditolak')}><X size={15} />Tolak</button></>}
                </div>
              </div>
            </article>
          })}</div>
        )}
      </section>

      <section className="panel review-section">
        <div className="panel-heading"><div><h3>{role === 'sarpras' ? 'Booking untuk direkomendasikan' : 'Booking untuk diputuskan'}</h3><p>Booking Guru/Wali Kelas, Senin sampai Minggu pukul 07.00–16.00. Waktu yang bertabrakan ditolak sebelum masuk daftar ini.</p></div></div>
        {sarprasBookings.length === 0 ? <EmptyState icon={CalendarDays} title="Tidak ada booking untuk ditinjau" description="Pengajuan booking akan tampil setelah dikirim." /> : (
          <div className="review-list">{sarprasBookings.map((booking) => <article className="review-item" key={booking.id}>
            <div className="review-item-copy"><div className="ticket-number-line"><span>Permintaan ruangan</span><span className={statusClass(booking.status)}>{BOOKING_LABELS[booking.status]}</span>{booking.status === 'menunggu_kepsek' && <span className="status status-green">Direkomendasikan Sarana Prasarana</span>}</div><h4>{roomName(booking.roomId)}</h4><p>{formatDate(booking.date)} · {booking.start} sampai {booking.end}</p><p>{booking.requestedCapacity} orang diminta, kapasitas ruangan {rooms.find((room) => room.id === booking.roomId)?.capacity ?? 'tidak diketahui'} orang.</p><p>{booking.purpose}</p>{booking.status === 'ditolak' && booking.rejectionNote && <p className="rejection-note">Ditolak pada tahap {booking.rejectionStage ? BOOKING_LABELS[booking.rejectionStage] : 'persetujuan Kepala Sekolah'}. Alasan: {booking.rejectionNote}</p>}</div>
            <div className="review-item-side">
              <div className="review-item-meta"><div><span>Pengaju</span><strong>{booking.requester}</strong></div></div>
              <div className="review-item-actions review-booking-actions">
                {booking.letterId && <button className="button button-quiet" onClick={() => onReadLetter(booking)}><FileText size={15} />Baca surat PDF</button>}
                {role === 'kepsek' && booking.sarprasReportPath && <button className="button button-quiet" onClick={() => onReadReport(booking.sarprasReportPath ?? null, `Laporan Sarpras ${roomName(booking.roomId)}.pdf`)}><FileText size={15} />Laporan Sarpras PDF</button>}
                {role === 'sarpras' && <><button className="button button-primary" onClick={() => onPrepareBookingReport(booking)}><Check size={15} />Buat laporan dan rekomendasikan</button><button className="button button-quiet" onClick={() => onBookingUpdate(booking.id, 'ditolak')}><X size={15} />Tolak</button></>}
                {role === 'kepsek' && <><button className="button button-primary" onClick={() => onBookingUpdate(booking.id, 'disetujui')}><Check size={15} />Setujui</button><button className="button button-quiet" onClick={() => onBookingUpdate(booking.id, 'ditolak')}><X size={15} />Tolak</button></>}
              </div>
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
  onUpdateRoom,
  onDelete,
  onSetArchived,
  onSetOccupancy,
  onClearOccupancy,
}: {
  rooms: Room[]
  now: number
  onToggle: (id: string) => void
  onAdd: (event: FormEvent<HTMLFormElement>) => void
  onUpdateRoom: (id: string, event: FormEvent<HTMLFormElement>) => Promise<boolean>
  onDelete: (id: string) => void
  onSetArchived: (id: string, isArchived: boolean) => void
  onSetOccupancy: (id: string, event: FormEvent<HTMLFormElement>) => void
  onClearOccupancy: (id: string) => void
}) {
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null)

  async function submitRoomEdit(roomId: string, event: FormEvent<HTMLFormElement>) {
    const saved = await onUpdateRoom(roomId, event)
    if (saved) setEditingRoomId(null)
  }

  return (
    <div className="page-stack">
      <PageIntro title="Data ruangan" description="Edit detail ruangan, arsipkan untuk menyimpan riwayat booking, atau hapus permanen setelah tidak ada laporan terbuka dan booking aktif." />
      <section className="room-admin-grid">
        {rooms.map((room) => <article className="panel room-admin-card" key={room.id}>
          <div className="room-admin-top"><span className="room-large-icon"><Building2 size={21} /></span><span className={room.isArchived ? 'room-status room-status-archived' : room.status === 'tersedia' ? 'room-status room-status-open' : 'room-status room-status-pending'}>{room.isArchived ? 'Diarsipkan' : room.status === 'tersedia' ? 'Tersedia' : 'Tentatif'}</span></div>
          {editingRoomId === room.id ? (
            <form className="room-edit-form" onSubmit={(event) => submitRoomEdit(room.id, event)}>
              <label className="field"><span>Nama ruangan</span><input name="name" defaultValue={room.name} required /></label>
              <label className="field"><span>Kode ruang</span><input name="code" defaultValue={room.code} required /></label>
              <label className="field"><span>Lokasi</span><input name="location" defaultValue={room.location} required /></label>
              <label className="field"><span>Kapasitas</span><input name="capacity" type="number" min="1" step="1" defaultValue={room.capacity} required /></label>
              <label className="field room-edit-facilities"><span>Fasilitas</span><input name="facilities" defaultValue={room.facilities === 'Belum dicantumkan.' ? '' : room.facilities} placeholder="Contoh: AC, proyektor, papan tulis" /></label>
              <div className="room-edit-actions">
                <button className="button button-primary" type="submit">Simpan perubahan</button>
                <button className="button button-quiet" type="button" onClick={() => setEditingRoomId(null)}>Batal</button>
              </div>
            </form>
          ) : <>
            <h3>{room.name}</h3><p>{room.location}</p>
            <div className="room-admin-details"><span>Kode</span><strong>{room.code}</strong><span>Kapasitas</span><strong>{room.capacity} orang</strong><span>Fasilitas</span><strong>{room.facilities}</strong></div>
            <button className="button button-quiet button-wide" onClick={() => setEditingRoomId(room.id)}>Edit data ruangan</button>
          </>}
          {!room.isArchived && <>
            {room.occupiedFrom && room.occupiedUntil && new Date(room.occupiedUntil).getTime() > now && <p className="room-occupancy-status">Pemakaian tercatat sampai {formatLocalDateTime(room.occupiedUntil)}.</p>}
            <form className="room-occupancy-form" onSubmit={(event) => onSetOccupancy(room.id, event)}>
              <label className="field"><span>Terpakai sampai</span><input name="occupiedUntil" type="datetime-local" min={toLocalDateTime(new Date(now))} defaultValue={room.occupiedUntil ?? ''} required /></label>
              <button className="button button-quiet button-wide" type="submit"><Clock3 size={15} />Simpan waktu</button>
            </form>
            {room.occupiedUntil && <button className="button button-quiet button-wide" onClick={() => onClearOccupancy(room.id)}>Hapus jadwal terpakai</button>}
            <button className={room.status === 'tersedia' ? 'button button-quiet button-wide' : 'button button-primary button-wide'} onClick={() => onToggle(room.id)}>
              {room.status === 'tersedia' ? 'Tandai perlu konfirmasi' : 'Konfirmasi tersedia'}
            </button>
            <button className="button button-quiet button-wide" onClick={() => onSetArchived(room.id, true)}><Archive size={15} />Arsipkan ruangan</button>
          </>}
          {room.isArchived && <button className="button button-quiet button-wide" onClick={() => onSetArchived(room.id, false)}><RotateCcw size={15} />Pulihkan ruangan</button>}
          <button className="button button-danger button-wide" onClick={() => onDelete(room.id)}><Trash2 size={15} />Hapus permanen</button>
        </article>)}
      </section>
      <section className="panel form-panel room-add-panel">
        <div className="panel-heading"><div><h3>Tambah data ruangan</h3><p>Ruangan baru dimulai sebagai tentatif sampai kelayakannya dikonfirmasi.</p></div></div>
        <form className="room-add-form" onSubmit={onAdd}>
          <label className="field"><span>Nama ruangan</span><input name="name" placeholder="Nama sesuai data sekolah" required /></label>
          <label className="field"><span>Kode ruang</span><input name="code" placeholder="Kode ruang" required /></label>
          <label className="field"><span>Lokasi</span><input name="location" placeholder="Gedung dan lantai" required /></label>
          <label className="field"><span>Kapasitas</span><input name="capacity" type="number" min="1" step="1" placeholder="0" required /></label>
          <label className="field"><span>Fasilitas</span><input name="facilities" placeholder="Contoh: AC, proyektor, papan tulis" /></label>
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
  return <div className="compact-row"><span className="compact-icon"><TicketCheck size={16} /></span><div className="compact-copy"><strong>{ticket.title}</strong><small>{ticket.equipment} · Rusak {ticket.damagedQuantity ?? '–'} · {formatShortDate(ticket.createdAt)}</small></div><span className={statusClass(ticket.status)}>{TICKET_LABELS[ticket.status]}</span></div>
}
