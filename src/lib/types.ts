export interface User {
  id: string
  name: string | null
  email: string | null
  role: string | null
  status: string | null
}

export interface Store {
  id: string
  name: string | null
  address: string | null
  phone: string | null
  status: string | null
  storecode: string | null
}

export interface Customer {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  address: string | null
}

export interface Product {
  id: string
  name: string | null
  price: number | null
  selling_price: number | null
  barcode: string | null
}

export interface BillItem {
  id: number
  billid: string | null
  productid: string | null
  quantity: number | null
  price: number | null
  total: number | null
  products?: Product | null
}

export interface AttendanceEmployee {
  id: string
  store_id: string
  name: string
  status: string // active | disabled
  enroll_status: string // pending | enrolled
  photo_url: string | null
  enrolled_at: string | null
  created_at: string | null
  is_roaming: boolean // can mark attendance at any store, not just store_id
}

export interface AttendanceRecord {
  id: string
  employee_id: string
  store_id: string
  device_id: string | null
  type: string // in | out
  ts: string
  match_score: number | null
  photo_url: string | null
  attendance_employees?: { name: string } | null
}

export interface AttendanceDevice {
  id: string
  store_id: string
  name: string | null
  activation_code: string | null
  status: string // unclaimed | active | disabled
  device_info: string | null
  last_seen: string | null
  activated_at: string | null
  app_version: string | null
}

export interface Bill {
  id: string
  subtotal: number | null
  total: number | null
  paymentmethod: string | null
  timestamp: string | null
  status: string | null
  discount_amount: number | null
  discount_percentage: number | null
  storeid: string | null
  customerid: string | null
  userid: string | null
  createdby: string | null
  created_at: string | null
  customers?: Customer | null
  users?: User | null
  store?: Store | null
}
