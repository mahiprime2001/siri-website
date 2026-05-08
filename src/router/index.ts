import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '../lib/auth'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/Login.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('../views/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: { name: 'bills' } },
      {
        path: 'bills',
        name: 'bills',
        component: () => import('../views/Bills.vue'),
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: { name: 'bills' } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const { isAuthenticated, isAdmin } = useAuth()
  if (to.meta.requiresAuth && (!isAuthenticated.value || !isAdmin.value)) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && isAuthenticated.value && isAdmin.value) {
    return { name: 'bills' }
  }
})

export default router
