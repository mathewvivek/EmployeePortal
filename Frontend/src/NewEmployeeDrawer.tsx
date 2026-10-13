import type { Employee } from './api';
import EmployeeFormDrawer from './EmployeeFormDrawer';

export default function NewEmployeeDrawer({ preferredCurrency, close, created }: {
  preferredCurrency: string; close: () => void; created: (employee: Employee) => void;
}) {
  return <EmployeeFormDrawer preferredCurrency={preferredCurrency} close={close} saved={created} />;
}
