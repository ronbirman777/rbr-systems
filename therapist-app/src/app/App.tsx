import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { EcosystemProvider } from '@/state/EcosystemProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { ScrollToTop } from './ScrollToTop';
import { TherapistShell } from '@/components/layout/TherapistShell';
import { ClientShell } from '@/components/layout/ClientShell';

import TherapistToday from '@/routes/therapist/Today';
import ClientDirectory from '@/routes/therapist/ClientDirectory';
import ClientProfile from '@/routes/therapist/ClientProfile';
import ContinuousCare from '@/routes/therapist/ContinuousCare';
import TherapistSessions from '@/routes/therapist/Sessions';
import TherapistMessages from '@/routes/therapist/Messages';
import TherapistResources from '@/routes/therapist/Resources';

import ClientToday from '@/routes/client/Today';
import ClientPractices from '@/routes/client/Practices';
import ClientPracticeDetail from '@/routes/client/PracticeDetail';
import ClientJourney from '@/routes/client/Journey';
import ClientMessages from '@/routes/client/Messages';
import ClientResources from '@/routes/client/Resources';
import ClientPrivacy from '@/routes/client/Privacy';

export function App() {
  return (
    <EcosystemProvider>
      <ToastProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<Navigate to="/therapist/today" replace />} />

            <Route path="/therapist" element={<TherapistShell />}>
              <Route index element={<Navigate to="/therapist/today" replace />} />
              <Route path="today" element={<TherapistToday />} />
              <Route path="clients" element={<ClientDirectory />} />
              <Route path="clients/:clientId" element={<ClientProfile />} />
              <Route path="care" element={<ContinuousCare />} />
              <Route path="sessions" element={<TherapistSessions />} />
              <Route path="messages" element={<TherapistMessages />} />
              <Route path="messages/:clientId" element={<TherapistMessages />} />
              <Route path="resources" element={<TherapistResources />} />
            </Route>

            <Route path="/client/:clientId" element={<ClientShell />}>
              <Route index element={<Navigate to="today" replace />} />
              <Route path="today" element={<ClientToday />} />
              <Route path="practices" element={<ClientPractices />} />
              <Route path="practices/:practiceId" element={<ClientPracticeDetail />} />
              <Route path="journey" element={<ClientJourney />} />
              <Route path="messages" element={<ClientMessages />} />
              <Route path="resources" element={<ClientResources />} />
              <Route path="privacy" element={<ClientPrivacy />} />
            </Route>

            <Route path="*" element={<Navigate to="/therapist/today" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </EcosystemProvider>
  );
}
