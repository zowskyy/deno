# gateway-probe Case Study: CAKE/SQM Effect on Bufferbloat

**Date**: [DATE]  
**Tester**: [NAME]  
**Summary**: Quantifying the latency improvement from enabling CAKE active queue management on OpenWrt/SQM.

## Test Environment

### Network Topology

```
External iperf3 server (cloud provider: [PROVIDER], region: [REGION])
        |
     Internet
        |
T-Mobile Home Internet gateway (model: [MODEL], signal: [RSSI] dBm)
        |
OpenWrt WAN interface ([WAN_IFACE], speed: [SPEED])
        |
OpenWrt LAN / CAKE qdisc
        |
Wired Linux test client (laptop: [MODEL], OS: [OS_VERSION], iperf3: [VERSION])
```

### Equipment and Software

| Component | Details |
|---|---|
| OpenWrt version | [VERSION] (release date [DATE]) |
| Router model | [MODEL] |
| Router CPU | [CPU_MODEL, FREQ_GHZ] |
| Router RAM | [RAM_MB] MB |
| Flow offload | [on/off] |
| WAN interface | [NAME] ([OPERSTATE], [SPEED] Mbps) |
| SQM config file | `[PATH]` |
| CAKE bandwidth limit (upload) | [MBPS] Mb/s |
| CAKE bandwidth limit (download, IFB) | [MBPS] Mb/s |
| CAKE script/profile | [PROFILE_NAME] |
| Test client OS | [OS] [VERSION] |
| iperf3 version | [VERSION] |
| iperf3 server location | [LOCATION] ([COUNTRY]) |
| ping target | [IP/HOST] ([DISTANCE_KM] km / [LATENCY_EST] ms typical) |
| gateway-probe version | [VERSION] |

### Test Period

- **Start date/time**: [DATE] [TIME] [TZ]
- **End date/time**: [DATE] [TIME] [TZ]
- **Duration**: [N] days
- **Environmental notes**: [weather, time of day, known network events, etc.]

## Test Procedure

### Execution Order

All tests were run in the following order to minimize time-of-day effects. Each condition was repeated **three times** in alternating order:

1. SQM **off**, idle (baseline)
2. SQM **off**, upload-loaded
3. SQM **on**, idle (post-enable)
4. SQM **on**, upload-loaded
5. (Optional) SQM **off**, download-loaded
6. (Optional) SQM **on**, download-loaded

Each loaded test ran for **30 seconds**. Idle tests ran 60 pings (~15 seconds).

### Load Test Details

- **Upload-loaded**: iperf3 client → server, `-t 30 -b 0` (no rate limit), WAN egress direction
- **Download-loaded**: iperf3 server → client (reverse), `-t 30 -R -b 0`, WAN ingress/IFB direction
- **Concurrent latency**: ping to [TARGET_IP] at ~4 pings/second during load

### Validation Criteria

Each loaded-test report was validated before inclusion:

- [ ] iperf3 client exit code = 0
- [ ] iperf3 reported throughput > 5 Mb/s
- [ ] WAN egress byte counter increased by > 10 MiB (upload) or IFB by > 10 MiB (download)
- [ ] Latency sample overlap with load window ≥ 70% of test duration

## Results

### Summary Table

| # | Condition | Run | Idle RTT p95 (ms) | Loaded RTT p95 (ms) | Added Latency (ms) | Throughput (Mb/s) | CAKE Activity |
|---|---|---|---:|---:|---:|---:|---|
| 1 | SQM off | #1 | [VAL] | [VAL] | [VAL] | [VAL] | — |
| 2 | SQM off | #2 | [VAL] | [VAL] | [VAL] | [VAL] | — |
| 3 | SQM off | #3 | [VAL] | [VAL] | [VAL] | [VAL] | — |
| — | **SQM off median** | — | **[VAL]** | **[VAL]** | **[VAL]** | **[VAL]** | — |
| 4 | SQM on | #1 | [VAL] | [VAL] | [VAL] | [VAL] | Yes (↑ drops/marks) |
| 5 | SQM on | #2 | [VAL] | [VAL] | [VAL] | [VAL] | Yes |
| 6 | SQM on | #3 | [VAL] | [VAL] | [VAL] | [VAL] | Yes |
| — | **SQM on median** | — | **[VAL]** | **[VAL]** | **[VAL]** | **[VAL]** | Yes |

### Key Findings

**SQM off**: Loaded latency increased by **[DELTA]** ms compared to idle.

**SQM on**: Loaded latency increased by **[DELTA]** ms compared to idle.

**Improvement**: CAKE reduced added latency by **[IMPROVEMENT]** ms (**[PCT]%** reduction).

### Download-Loaded Results (if applicable)

| Condition | Idle p95 (ms) | Loaded p95 (ms) | Added (ms) | Throughput (Mb/s) | IFB CAKE Activity |
|---|---:|---:|---:|---:|---|
| SQM off | [VAL] | [VAL] | [VAL] | [VAL] | — |
| SQM on | [VAL] | [VAL] | [VAL] | [VAL] | Yes |
| Improvement | — | — | **[DELTA]** ms | — | — |

## Interpretation

### Before CAKE (SQM off)

With SQM disabled, every upload test showed **substantial latency increase**. This indicates:

- Packets are queuing on or near the gateway's uplink.
- The gateway has no active queue management; buffering is passive (tail drop only).
- High-throughput traffic (iperf3) fills buffers faster than the WAN egress link can drain them.

**Evidence from CAKE qdisc statistics** (when present, inactive):
- Drop counter: [VAL] (tail drops, not AQM-driven)
- Mark counter: [VAL] (inactive; no ECN signaling)

### After CAKE (SQM on)

With SQM/CAKE enabled, the same load test showed **substantially reduced latency increase**:

- CAKE detects and marks (or drops) packets before excessive buffers form.
- Latency rise is lower because the queue operates closer to its configured limit.
- Throughput is comparable, indicating CAKE is not overly aggressive.

**Evidence from CAKE qdisc statistics**:
- Drop counter increased by: [VAL] packets during the 30-second window
- Mark counter increased by: [VAL] ECN marks during the 30-second window
- Backlog bytes at end: [VAL] bytes (target qdisc maintained low backlog)

### Conclusion

This test provides **evidence of latency reduction** under confirmed load when CAKE is enabled. The observed **[IMPROVEMENT] ms reduction** corresponds to:

- Faster response times for interactive applications (web browsing, gaming)
- Reduced variance in latency (lower jitter)
- Lower risk of timeout-based failures in time-sensitive protocols

---

## Limitations and Caveats

⚠️ **This is one gateway, one ISP, one router model, one test period.**

- **Geography**: T-Mobile Home Internet signal varies by location and time of day.
- **Hardware**: Router CPU, RAM, and firmware version affect traffic processing.
- **Topology**: Results reflect traffic behind OpenWrt. End-to-end application latency may differ if other queues exist upstream.
- **Load pattern**: iperf3 generates sustained, high-throughput load; real-world traffic is more bursty.
- **Network conditions**: ISP congestion, time of day, weather, and other Wi-Fi interference were not controlled.
- **Measurement method**: Ping is a proxy for application latency; actual app experience depends on protocol, packet size, and retransmit behavior.

**This test does NOT prove**:
- CAKE will reduce latency on all ISPs or router models.
- CAKE is optimal for this gateway without further tuning.
- Video conferencing, VoIP, or online gaming will improve (though lower latency variance typically helps).
- The exact bandwidth limit chosen is appropriate for all traffic patterns.

**Generalization**: Use this case study as a reference for your own environment, but expect variation based on ISP, hardware, and configuration.

---

## Full Report References

For the raw probe reports and detailed statistics:

- [SQM off, idle #1](./reports/sqm-off-idle-1.json)
- [SQM off, upload-loaded #1](./reports/sqm-off-upload-loaded-1.json)
- [SQM on, idle #1](./reports/sqm-on-idle-1.json)
- [SQM on, upload-loaded #1](./reports/sqm-on-upload-loaded-1.json)

Each report includes:
- Timestamp and duration
- Interface state (carrier, errors)
- Default route and gateway reachability
- Idle and loaded latency percentiles (p50, p95)
- DNS resolution time
- CAKE qdisc drops, marks, backlog statistics
- Deterministic findings (physical_link_unavailable, latency_increased_*, cake_aqm_events_observed, etc.)

---

## Recommendations

Based on the evidence from this case study:

1. **For this router/ISP combination**, enabling CAKE provides **measurable latency reduction** ([IMPROVEMENT] ms) during high-throughput periods.

2. **Next steps**:
   - [ ] Monitor long-term performance (1–4 weeks) to detect ISP or seasonal patterns.
   - [ ] Test different CAKE bandwidth limits to find the optimal balance.
   - [ ] Validate on 5 GHz Wi-Fi connections (if applicable).
   - [ ] Compare gaming or VoIP application performance before/after CAKE in production.

3. **Configuration recommendation** (if results are positive):
   - Apply the SQM/CAKE configuration to the gateway.
   - Set CAKE bandwidth limit to [RECOMMENDED_MBPS] Mb/s (based on observed throughput during load tests).
   - Monitor for the next 7 days; revert if unexpected issues occur.
   - Re-run latency tests after 1 month to confirm sustained improvement.

---

**Generated by gateway-probe**  
**Version**: [PROBE_VERSION]  
**Published**: [DATE]
