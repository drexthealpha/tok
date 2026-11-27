import { render } from 'preact';
import { App } from './app';
import './style.css';

const root = document.getElementById('app')!;
// Replace the static first screen from index.html.
root.textContent = '';
render(<App />, root);
