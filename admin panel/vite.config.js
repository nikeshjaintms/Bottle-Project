import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      }
    }
  },
  build: {
    // Optimize chunk splitting
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Vendor chunks to separate heavy dependencies
          if (id.includes('node_modules/react') && (id.includes('react-dom') || id.includes('react-router'))) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@reduxjs/toolkit') || id.includes('node_modules/react-redux')) {
            return 'vendor-redux';
          }
          if (id.includes('node_modules/bootstrap') || id.includes('node_modules/react-bootstrap')) {
            return 'vendor-ui';
          }
          if (id.includes('node_modules/exceljs') || id.includes('node_modules/xlsx')) {
            return 'vendor-excel';
          }
          if (id.includes('node_modules/recharts')) {
            return 'vendor-charts';
          }
          if (id.includes('node_modules/react-select') || id.includes('node_modules/react-rnd')) {
            return 'vendor-forms';
          }
          if (id.includes('node_modules/axios') || id.includes('node_modules/lodash') || 
              id.includes('node_modules/@casl')) {
            return 'vendor-utils';
          }
          if (id.includes('node_modules/sweetalert2') || id.includes('node_modules/html2pdf') ||
              id.includes('node_modules/react-barcode')) {
            return 'vendor-other';
          }
        }
      }
    },
    // Adjust chunk size warning - vendor chunks are expected to be large
    // due to ExcelJS, XLSX, and other heavy dependencies
    chunkSizeWarningLimit: 1500,
  }
})
