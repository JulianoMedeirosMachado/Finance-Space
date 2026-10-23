import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from './stores/auth';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/dashboard' },
    { path: '/login', component: () => import('./views/AuthView.vue'), meta: { public: true } },
    {
      path: '/reset-password',
      component: () => import('./views/AuthView.vue'),
      meta: { public: true },
    },
    { path: '/dashboard', component: () => import('./views/OverviewView.vue') },
    { path: '/month', component: () => import('./views/MonthView.vue') },
    { path: '/goals', component: () => import('./views/GoalsView.vue') },
    { path: '/reports', component: () => import('./views/ReportsView.vue') },
    { path: '/settings', component: () => import('./views/SettingsView.vue') },
    ...[
      'accounts',
      'cards',
      'transactions',
      'recurring',
      'installments',
      'invoices',
      'income',
      'benefits',
      'settlements',
      'history',
      'categories',
      'people',
    ].map((kind) => ({
      path: `/${kind}`,
      component: () => import('./views/ResourceView.vue'),
      props: { kind },
      meta: { title: kind },
    })),
    { path: '/bank', redirect: '/accounts' },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.ready) {
    await auth.initialize();
  }
  let destination: string | undefined;
  if (!to.meta.public && !auth.user) {
    destination = '/login';
  } else if (to.path === '/login' && auth.user) {
    destination = '/dashboard';
  }
  return destination;
});
router.onError((error) => {
  console.error(error);
  document.getElementById('startup-error')?.remove();
  const notice = document.createElement('p');
  notice.id = 'startup-error';
  notice.textContent =
    'Não foi possível conectar. Verifique se o servidor está iniciado e atualize a página.';
  document.body.append(notice);
});
