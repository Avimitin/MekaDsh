// Port of mekaweb's notification settings: browser notifications with their
// permission and availability states, in-app toasts, and the completion sound,
// each with a Test control and inline problem descriptions.

import { useSyncExternalStore } from 'react';
import { useRuntime, useSettings } from '../../../connections/context';
import { Button } from '../../primitives/Button';
import { Switch } from '../../primitives/Switch';
import { Row, Section } from '../shared/page';

export function NotificationsSection() {
  const { notifications } = useRuntime();
  const settings = useSettings();
  const state = useSyncExternalStore(notifications.subscribe, notifications.getSnapshot);
  const enabled = settings.turnNotifications && state.permission === 'granted';
  const problem =
    state.availability === 'insecure'
      ? 'Browser notifications require HTTPS or localhost.'
      : state.availability === 'install'
        ? 'Add mekadsh to your Home Screen and open it there to enable browser notifications.'
        : state.availability === 'unsupported'
          ? 'Browser notifications are unavailable in this browser.'
          : state.permission === 'denied'
            ? 'Notifications are blocked. Allow them in your browser’s site settings.'
            : state.error;
  return (
    <Section
      title="Notifications"
      description="Turn completion alerts in this browser and inside the app."
    >
      <Row
        flush
        label="Browser notifications"
        description={problem}
        control={
          <>
            <Switch
              label="Browser notifications"
              checked={enabled}
              disabled={
                state.busy || state.availability !== 'available' || state.permission === 'denied'
              }
              onChange={(checked) => {
                if (checked) void notifications.enable();
                else notifications.disable();
              }}
            />
            <Button
              variant="outline"
              size="sm"
              aria-label="Test browser notifications"
              disabled={!enabled || state.busy}
              onClick={() => void notifications.test()}
            >
              Test
            </Button>
          </>
        }
      />
      <Row
        label="In-app notifications"
        description={state.appError}
        control={
          <>
            <Switch
              label="In-app notifications"
              checked={settings.inAppNotifications}
              onChange={(checked) => notifications.setInApp(checked)}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!settings.inAppNotifications}
              aria-label="Test in-app notifications"
              onClick={() => notifications.testInApp()}
            >
              Test
            </Button>
          </>
        }
      />
      <Row
        label="Completion sound"
        description={state.soundError}
        control={
          <>
            <Switch
              label="Completion sound"
              checked={settings.completionSound}
              onChange={(checked) => notifications.setSound(checked)}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!settings.completionSound}
              aria-label="Test completion sound"
              onClick={() => void notifications.testSound()}
            >
              Test
            </Button>
          </>
        }
      />
    </Section>
  );
}
