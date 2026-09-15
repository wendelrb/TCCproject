import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { iniciarTema } from './lib/estado';
import './estilo/base.css';

iniciarTema();
createApp(App).use(router).mount('#app');
