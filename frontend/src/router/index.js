import { createRouter, createWebHistory } from "vue-router";
import Dashboard from '../views/DashboardView.vue';
import CardsView from "@/views/CardsView.vue";

const routes = [
    {
        path : '/', 
        redirect: '/dashboard'
    },
    { 
        path: '/dashboard', 
        component: Dashboard
    },
    {
        path: '/cards',
        component: CardsView
    }


];

const router = createRouter({
    history: createWebHistory(),
    routes
});

export default router;