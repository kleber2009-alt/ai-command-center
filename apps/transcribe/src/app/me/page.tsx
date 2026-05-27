import MeChat from './MeChat'
import OwnerGate from '@/components/OwnerGate'

export default function MePage() {
  return (
    <OwnerGate>
      <MeChat />
    </OwnerGate>
  )
}
