// Trechos reais do sunshine.log (Sunshine 2026.914.233613, 02/10/2026), reduzidos.

export const DISPLAYS_BLOCK = `[2026-10-02 16:54:52.472]: Info: Currently available display devices:
[
  {
    "device_id": "{5eb52002-659f-5729-bdd8-9cdc4efd1bf5}",
    "display_name": "\\\\\\\\.\\\\DISPLAY40",
    "edid": {
      "manufacturer_id": "MTT",
      "product_code": "1337",
      "serial_number": 518463207
    },
    "friendly_name": "VDD by MTT",
    "info": {
      "hdr_state": "Disabled",
      "origin_point": { "x": 1920, "y": 0 },
      "primary": false,
      "refresh_rate": { "type": "rational", "value": { "denominator": 1, "numerator": 60 } },
      "resolution": { "height": 1080, "width": 1920 },
      "resolution_scale": { "type": "rational", "value": { "denominator": 100, "numerator": 100 } }
    }
  },
  {
    "device_id": "{e1034c27-4b10-5e8d-aede-ee559334a996}",
    "display_name": "\\\\\\\\.\\\\DISPLAY1",
    "edid": { "manufacturer_id": "AOC", "product_code": "2402", "serial_number": 105 },
    "friendly_name": "24G2W1G4",
    "info": {
      "hdr_state": null,
      "origin_point": { "x": 0, "y": 0 },
      "primary": true,
      "refresh_rate": { "type": "rational", "value": { "denominator": 1001, "numerator": 60000 } },
      "resolution": { "height": 1080, "width": 1920 },
      "resolution_scale": { "type": "rational", "value": { "denominator": 100, "numerator": 100 } }
    }
  }
]
`

export const STARTUP_SOFTWARE_LOG = `[2026-10-02 17:10:53.957]: Info: Sunshine version: 2026.914.233613 commit: 63d35f702ee9e362e43263742981836ec0710384
[2026-10-02 17:10:53.958]: Info: Package Publisher: LizardByte
${DISPLAYS_BLOCK}[2026-10-02 17:11:17.657]: Info: // Testing for available encoders, this may generate errors. You can safely ignore those errors. //
[2026-10-02 17:11:17.660]: Info: Trying encoder [nvenc]
[2026-10-02 17:11:17.938]: Info: Encoder [nvenc] is not supported on this GPU
[2026-10-02 17:11:18.094]: Info: Trying encoder [amdvce]
[2026-10-02 17:11:18.496]: Info: Encoder [amdvce] failed
[2026-10-02 17:11:18.653]: Info: Trying encoder [software]
[2026-10-02 17:11:19.765]: Info: Found H.264 encoder: libx264 [software]
[2026-10-02 17:11:19.774]: Info: Configuration UI available at [https://localhost:47990]
`

export const STARTUP_AMF_LOG = `[2026-10-02 17:20:00.000]: Info: Sunshine version: 2026.914.233613 commit: 63d35f702ee9e362e43263742981836ec0710384
${DISPLAYS_BLOCK}[2026-10-02 17:21:46.911]: Info: // Testing for available encoders, this may generate errors. You can safely ignore those errors. //
[2026-10-02 17:21:47.200]: Info: Trying encoder [amdvce]
[2026-10-02 17:21:49.033]: Info: Found H.264 encoder: h264_amf [amdvce]
[2026-10-02 17:21:49.033]: Info: Found HEVC encoder: hevc_amf [amdvce]
[2026-10-02 17:21:49.034]: Info: Configuration UI available at [https://localhost:47990]
[2026-10-02 17:21:49.186]: Info: CLIENT CONNECTED
`
