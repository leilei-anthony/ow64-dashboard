import { render } from 'preact';
import { App } from './app';
import { init } from './storage/store';
import { startCalendarSync } from './storage/calendar';
import { startPomodoroClient } from './storage/pomodoro';
import './styles/app.css';

render(<App />, document.getElementById('app')!);
init()
  .then(() => {
    startPomodoroClient();
    startCalendarSync();
  })
  .catch((err) => console.error('OW64: failed to load data', err));
