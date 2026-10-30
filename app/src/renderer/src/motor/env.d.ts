import type { MotorApi } from '../../../shared/motor'

declare global {
  interface Window {
    motor: MotorApi
  }
}
