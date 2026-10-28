import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { takeToken } from './api';
import App from './App';

// The token is read before anything else and taken out of the address bar at once.
const token = takeToken(window.location, window.history);
const root = document.getElementById('prism-share');
if (root) {
    createRoot(root).render(
        <StrictMode>
            <App token={token} />
        </StrictMode>
    );
}
