import { render } from 'preact';
import { App } from './app';
import { init } from './storage/store';
import './styles/app.css';

render(<App />, document.getElementById('app')!);
init().catch((err) => console.error('OW64: failed to load data', err));
