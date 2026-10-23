import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import './styles.css';
import './styles/features.css';
import { initializeLanguage } from './i18n';

initializeLanguage();
createApp(App).use(createPinia()).use(router).mount('#app');
