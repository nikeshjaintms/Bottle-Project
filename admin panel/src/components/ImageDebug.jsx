import { useSelector } from 'react-redux';
import { getFullImageUrl } from '../utils/imageUrl';

/**
 * Debug component to display image URL information
 * Place this in your navbar or user detail to see what's happening
 * Remove in production
 */
export default function ImageDebug() {
  const { user } = useSelector((state) => state.auth);
  
  if (!user) return null;
  
  const imageUrl = getFullImageUrl(user.image);
  
  console.log('=== IMAGE DEBUG ===');
  console.log('User image from DB:', user.image);
  console.log('Full image URL:', imageUrl);
  console.log('VITE_BACKEND_URL:', import.meta.env.VITE_BACKEND_URL);
  console.log('VITE_API_URL:', import.meta.env.VITE_API_URL);
  
  return (
    <div style={{
      position: 'fixed',
      bottom: '10px',
      right: '10px',
      background: 'rgba(0,0,0,0.8)',
      color: '#fff',
      padding: '10px',
      borderRadius: '5px',
      fontSize: '11px',
      maxWidth: '300px',
      zIndex: 9999,
      fontFamily: 'monospace',
      maxHeight: '200px',
      overflow: 'auto'
    }}>
      <div><strong>IMAGE DEBUG</strong></div>
      <div>DB Image: {user.image || 'NULL'}</div>
      <div style={{ wordBreak: 'break-all' }}>
        URL: {imageUrl || 'NULL'}
      </div>
      <div>Backend: {import.meta.env.VITE_BACKEND_URL}</div>
      <button 
        onClick={() => {
          if (imageUrl) {
            fetch(imageUrl, { method: 'HEAD' })
              .then(r => console.log('Image URL valid:', r.ok))
              .catch(e => console.log('Image URL invalid:', e));
          }
        }}
        style={{
          marginTop: '5px',
          padding: '5px 10px',
          background: '#007bff',
          color: '#fff',
          border: 'none',
          borderRadius: '3px',
          cursor: 'pointer'
        }}
      >
        Test URL
      </button>
    </div>
  );
}
