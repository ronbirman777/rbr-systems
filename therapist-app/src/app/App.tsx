import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider } from '@/state/AppProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { ScrollToTop } from './ScrollToTop';
import { PractitionerShell } from '@/components/layout/PractitionerShell';
import { ClientShell } from '@/components/layout/ClientShell';

import Today from '@/routes/therapist/Today';
import Clients from '@/routes/therapist/Clients';
import ClientWorkspace from '@/routes/therapist/ClientWorkspace';
import ContinuousCare from '@/routes/therapist/ContinuousCare';
import Sessions from '@/routes/therapist/Sessions';
import SessionDetail from '@/routes/therapist/SessionDetail';
import Sanctuary from '@/routes/therapist/Sanctuary';
import SanctuaryResource from '@/routes/therapist/SanctuaryResource';
import Settings from '@/routes/therapist/Settings';

import ClientToday from '@/routes/client/Today';
import ClientJourney from '@/routes/client/Journey';
import ClientResources from '@/routes/client/Resources';
import ClientResourceCategory from '@/routes/client/ResourceCategory';
import ClientResourcePlayer from '@/routes/client/ResourcePlayer';
import ClientSessions from '@/routes/client/Sessions';
import ClientSessionDetail from '@/routes/client/SessionDetail';
import ClientPreSession from '@/routes/client/PreSession';
import ClientPractice from '@/routes/client/Practice';

export function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<Navigate to="/practitioner/today" replace />} />

            <Route path="/practitioner" element={<PractitionerShell />}>
              <Route index element={<Navigate to="/practitioner/today" replace />} />
              <Route path="today" element={<Today />} />
              <Route path="clients" element={<Clients />} />
              <Route path="clients/:clientId" element={<ClientWorkspace />} />
              <Route path="clients/:clientId/:tab" element={<ClientWorkspace />} />
              <Route path="care" element={<ContinuousCare />} />
              <Route path="sessions" element={<Sessions />} />
              <Route path="sessions/:sessionId" element={<SessionDetail />} />
              <Route path="sanctuary" element={<Sanctuary />} />
              <Route path="sanctuary/:resourceId" element={<SanctuaryResource />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            <Route path="/client/:clientId" element={<ClientShell />}>
              <Route index element={<Navigate to="today" replace />} />
              <Route path="today" element={<ClientToday />} />
              <Route path="journey" element={<ClientJourney />} />
              <Route path="resources" element={<ClientResources />} />
              <Route path="resources/:categoryId" element={<ClientResourceCategory />} />
              <Route path="resource/:resourceId" element={<ClientResourcePlayer />} />
              <Route path="sessions" element={<ClientSessions />} />
              <Route path="sessions/:sessionId" element={<ClientSessionDetail />} />
              <Route path="sessions/:sessionId/prepare" element={<ClientPreSession />} />
              <Route path="practice/:practiceId" element={<ClientPractice />} />
            </Route>

            <Route path="*" element={<Navigate to="/practitioner/today" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AppProvider>
  );
}
