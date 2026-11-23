import type { networkInterfaces } from 'node:os'
import { expect, it } from 'vitest'
import { lanAddress } from './wire'

type Interfaces = ReturnType<typeof networkInterfaces>
const ipv4 = (address: string): NonNullable<Interfaces[string]>[number] => ({
  address,
  family: 'IPv4' as const,
  internal: false,
  netmask: '255.255.255.0',
  mac: '00:00:00:00:00:00',
  cidr: `${address}/24`
})

it('Linux com Docker e VPN: o Wi-Fi, não a rede do contêiner nem a da VPN', () => {
  const interfaces = {
    docker0: [ipv4('172.17.0.1')],
    tun0: [ipv4('10.8.0.2')],
    'br-1a2b': [ipv4('172.18.0.1')],
    wlp2s0: [ipv4('192.168.1.6')]
  } as Interfaces
  expect(lanAddress(interfaces)).toBe('192.168.1.6')
})

it('Windows com Hyper-V, WSL e VirtualBox: a placa Wi-Fi', () => {
  const interfaces = {
    'vEthernet (Default Switch)': [ipv4('172.25.48.1')],
    'vEthernet (WSL)': [ipv4('172.30.16.1')],
    'VirtualBox Host-Only Network': [ipv4('192.168.56.1')],
    'Wi-Fi': [ipv4('192.168.0.23')]
  } as Interfaces
  expect(lanAddress(interfaces)).toBe('192.168.0.23')
})

it('rede de empresa em 10.x pelo cabo também vale; sem rede, nada', () => {
  expect(lanAddress({ Ethernet: [ipv4('10.1.2.3')] } as Interfaces)).toBe('10.1.2.3')
  expect(
    lanAddress({ lo: [{ ...ipv4('127.0.0.1'), internal: true }] } as Interfaces)
  ).toBeUndefined()
})

it('placa virtual em 192.168 (VMware) perde até para uma placa de nome desconhecido', () => {
  const interfaces = {
    'VMware Network Adapter VMnet8': [ipv4('192.168.200.1')],
    'Rede 2': [ipv4('10.0.0.5')]
  } as Interfaces
  expect(lanAddress(interfaces)).toBe('10.0.0.5')
})

it('Wi-Fi ou cabo vencem uma placa de nome desconhecido, mesmo em outra faixa', () => {
  const interfaces = {
    anything0: [ipv4('192.168.9.1')],
    Ethernet: [ipv4('10.0.0.9')]
  } as Interfaces
  expect(lanAddress(interfaces)).toBe('10.0.0.9')
})
