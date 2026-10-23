import { createApp, h } from 'vue'
import '@/assets/main.css'
import ResetDataModal from '@/components/ui/ResetDataModal.vue'
createApp({ render: () => h(ResetDataModal, { open: true, activeName: 'Portfolio 1', portfolioCount: 2 }) }).mount('#app')
