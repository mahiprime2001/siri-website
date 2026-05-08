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
