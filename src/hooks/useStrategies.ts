import { useCreatorRecordsVersion } from '@/creator/store'
import { useAsync } from '@/hooks/useAsync'
import { strategyService } from '@/services/strategyService'

/** All strategies (quant-created + demo). Reloads when the quant saves a strategy. */
export function useStrategies() {
  const v = useCreatorRecordsVersion()
  return useAsync(() => strategyService.listStrategies(), [v])
}

export function useStrategy(id: string | undefined) {
  const v = useCreatorRecordsVersion()
  return useAsync(() => (id ? strategyService.getStrategy(id) : Promise.resolve(null)), [id, v])
}
