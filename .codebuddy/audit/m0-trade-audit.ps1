# 独立审计 v2：直接从原始 JSON 判定不变量，不调用 packages/testkit 的校验器
# v2 修正：performs_R / consulted_C / informed_I 的方向是 role -> activity（toId 指向事项），
#          先前按 fromId 查是审计脚本自身的 bug。
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
$path = Join-Path $PSScriptRoot '..\..\packages\testkit\fixtures\demo-trade\model-bundle.json'
$raw = Get-Content $path -Raw -Encoding UTF8
$b = $raw | ConvertFrom-Json
$o = @($b.modelObject); $r = @($b.modelRelation)

"topLevelKeys=" + ((@($b.PSObject.Properties.Name)) -join ',')
"objects=$($o.Count) relations=$($r.Count) layouts=$(@($b.viewLayout).Count)"

$byId = @{}
foreach ($x in $o) { $byId[$x.id] = $x }

$dup = @($o | Group-Object { "$($_.kind)::$($_.code)" } | Where-Object { $_.Count -gt 1 })
"dupCodes=$($dup.Count)"

$badEp = @($r | Where-Object { -not $byId.ContainsKey($_.fromId) -or -not $byId.ContainsKey($_.toId) })
"badEndpoints=$($badEp.Count)"

$validRels = @($r | Where-Object { $byId.ContainsKey($_.fromId) -and $byId.ContainsKey($_.toId) })
$cross = @($validRels | Where-Object { $byId[$_.fromId].projectId -ne $byId[$_.toId].projectId })
"crossProjectRefs=$($cross.Count)"
"objectsOutsideProject=$(@($o | Where-Object { $_.projectId -ne $b.projectId }).Count)"
"layoutsPointingToMissingObject=$(@($b.viewLayout | Where-Object { -not $byId.ContainsKey($_.objectId) }).Count)"

$acts = @($o | Where-Object { $_.kind -eq 'activity' })
$missingR = 0; $badA = 0; $badC = 0
foreach ($a in $acts) {
  if (@($r | Where-Object { $_.kind -eq 'performs_R' -and $_.toId -eq $a.id }).Count -lt 1) { $missingR++ }
  if (@($r | Where-Object { $_.kind -eq 'accountable_A' -and $_.toId -eq $a.id }).Count -ne 1) { $badA++ }
}
foreach ($a in $acts) {
  $c = @($r | Where-Object { $_.kind -eq 'consulted_C' -and $_.toId -eq $a.id }).Count
  $i = @($r | Where-Object { $_.kind -eq 'informed_I' -and $_.toId -eq $a.id }).Count
  if ($c -gt 1 -or $i -gt 1) { $badC++ }
}
"activities=$($acts.Count) missingPerformsR=$missingR notExactlyOneAccountableA=$badA multiRaciOther=$badC"
"raciTotals R=$(@($r | Where-Object { $_.kind -eq 'performs_R' }).Count) A=$(@($r | Where-Object { $_.kind -eq 'accountable_A' }).Count) C=$(@($r | Where-Object { $_.kind -eq 'consulted_C' }).Count) I=$(@($r | Where-Object { $_.kind -eq 'informed_I' }).Count)"

$decs = @($o | Where-Object { $_.kind -eq 'decision' })
$noExit = 0; $noCond = 0
foreach ($d in $decs) {
  $outs = @($r | Where-Object { $_.kind -eq 'flow_to' -and $_.fromId -eq $d.id })
  if ($outs.Count -eq 0) { $noExit++; continue }
  foreach ($x in $outs) {
    $c = "$($x.label)".Trim()
    if (-not $c) { $c = "$($x.payload.condition)".Trim() }
    if (-not $c) { $noCond++ }
  }
}
"decisions=$($decs.Count) withoutExit=$noExit branchesWithoutCondition=$noCond"

$exs = @($o | Where-Object { $_.kind -eq 'exception' })
$exNoT = 0
foreach ($e in $exs) { if (@($r | Where-Object { $_.kind -eq 'flow_to' -and $_.fromId -eq $e.id }).Count -eq 0) { $exNoT++ } }
"exceptions=$($exs.Count) withoutTarget=$exNoT"

$reqs = @($o | Where-Object { $_.kind -eq 'requirement' })
$reqNoSrc = 0
foreach ($q in $reqs) {
  $d = @($r | Where-Object { $_.kind -eq 'derived_from' -and $_.fromId -eq $q.id })
  if ($d.Count -eq 0) { $reqNoSrc++; continue }
  $ok = $false
  foreach ($x in $d) { if ($byId[$x.toId].kind -in @('problem', 'current_fact', 'target')) { $ok = $true } }
  if (-not $ok) { $reqNoSrc++ }
}
"requirements=$($reqs.Count) withoutTraceableSource=$reqNoSrc"

$visited = @{}
$queue = New-Object System.Collections.Queue
foreach ($s in @($o | Where-Object { $_.kind -eq 'start' })) { $queue.Enqueue($s.id); $visited[$s.id] = $true }
# v3 口径修正（由 adr 的 M0 复核指出）：可达性必须同时遍历 has_exception。
# 异常节点是由某主链节点"触发"的（role/activity --has_exception--> exception），
# 它本身通常不再回到主链，因此只用 flow_to 会把它误报为 unreachable。
while ($queue.Count -gt 0) {
  $cur = $queue.Dequeue()
  foreach ($x in @($r | Where-Object { $_.kind -in @('flow_to', 'has_exception') -and $_.fromId -eq $cur })) {
    if (-not $visited[$x.toId]) { $visited[$x.toId] = $true; $queue.Enqueue($x.toId) }
  }
}
$ends = @($o | Where-Object { $_.kind -eq 'end' })
$reachable = 0
foreach ($e in $ends) { if ($visited[$e.id]) { $reachable++ } }
"ends=$($ends.Count) reachableFromStart=$reachable reachableNodes=$($visited.Count)/$($o.Count)"
foreach ($u in @($o | Where-Object { $_.kind -in @('activity', 'decision', 'exception', 'end') -and -not $visited[$_.id] })) {
  "  unreachable: $($u.id) kind=$($u.kind) title=$($u.title)"
}
foreach ($e in $exs) {
  $trig = @($r | Where-Object { $_.kind -eq 'has_exception' -and $_.toId -eq $e.id })
  "  exception $($e.code) triggeredBy=$($trig.Count) outgoingFlowTo=$(@($r | Where-Object { $_.kind -eq 'flow_to' -and $_.fromId -eq $e.id }).Count)"
}

"supportedByTargets=" + ((@($r | Where-Object { $_.kind -eq 'supported_by' } | ForEach-Object { "$($_.toId)(kind=$($byId[$_.toId].kind))" })) -join ',')
"evidenceLikeObjects=" + (@($o | Where-Object { $_.kind -in @('current_fact', 'term') }).Count)
"distinctSourceStatus=" + ((@($o | Select-Object -ExpandProperty sourceStatus | Sort-Object -Unique)) -join ',')
"distinctState=" + ((@($o | Select-Object -ExpandProperty state | Sort-Object -Unique)) -join ',')
"relationKindsUsed=" + ((@($r | Select-Object -ExpandProperty kind | Sort-Object -Unique)) -join ',')
"objectKindsUsed=" + ((@($o | Select-Object -ExpandProperty kind | Sort-Object -Unique)) -join ',')
