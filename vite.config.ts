import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const geojsonPlugin: Plugin = {
  name: 'geojson-plugin',
  transform(code: string, id: string) {
    if (id.endsWith('.geojson')) {
      return {
        code: `export default ${code};`,
        map: null,
      };
    }
  },
};

export default defineConfig({
  plugins: [react(), geojsonPlugin],
  base: './',
});
