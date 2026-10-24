# 语音通话安卓端构建脚本（无需 Gradle）
# 用法： powershell -ExecutionPolicy Bypass -File android\build.ps1 [-Clean]
# 注意：aapt2 / zipalign 对含中文的绝对路径兼容性差，脚本统一使用相对路径。
param([switch]$Clean)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$bt = '..\.tools\build-tools\android-15'
$androidJar = '..\.tools\platform\android-35\android.jar'
$build = 'build'
$outDir = 'out'
$keystore = 'voicecall.keystore'
$outApk = 'out\VoiceCall.apk'

$javac = (Get-Command javac -ErrorAction Stop).Source
$javaBin = Split-Path -Parent $javac
$previousPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$probe = @(& java -XshowSettings:properties -version 2>&1 | ForEach-Object { "$_" })
$ErrorActionPreference = $previousPreference
$javaHome = $null
foreach ($line in $probe) {
    $index = $line.IndexOf('java.home = ')
    if ($index -ge 0) {
        $javaHome = $line.Substring($index + 12).Trim()
        break
    }
}
if (-not $javaHome) {
    $candidate = Get-ChildItem "$env:ProgramFiles\Java" -Directory -Filter 'jdk*' -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | Select-Object -First 1
    if ($candidate) { $javaHome = $candidate.FullName }
}
if (-not $javaHome) { throw '未找到 JDK，请安装 JDK 21+ 并设置 JAVA_HOME' }
$env:JAVA_HOME = $javaHome
$env:PATH = "$(Join-Path $javaHome 'bin');$javaBin;$env:PATH"

foreach ($tool in @('aapt2.exe', 'zipalign.exe', 'd8.bat', 'apksigner.bat')) {
    if (-not (Test-Path (Join-Path $bt $tool))) {
        throw "缺少构建工具 $tool，请检查 .tools\build-tools\android-15"
    }
}
if (-not (Test-Path $androidJar)) { throw '缺少 android.jar，请检查 .tools\platform\android-35' }

if ($Clean -and (Test-Path $build)) {
    Remove-Item -Recurse -Force $build
}
New-Item -ItemType Directory -Force -Path "$build\gen" | Out-Null
New-Item -ItemType Directory -Force -Path "$build\classes" | Out-Null
New-Item -ItemType Directory -Force -Path "$build\dex" | Out-Null
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
Get-ChildItem "$build\dex" -Force | Remove-Item -Force -Recurse

Write-Host '[1/7] 编译资源'
& "$bt\aapt2.exe" compile --dir res -o "$build\res.zip"
if ($LASTEXITCODE -ne 0) { throw 'aapt2 compile 失败' }

Write-Host '[2/7] 链接资源与清单'
& "$bt\aapt2.exe" link -o "$build\base.apk" `
    -I $androidJar `
    --manifest AndroidManifest.xml `
    --java "$build\gen" `
    "$build\res.zip" `
    --auto-add-overlay
if ($LASTEXITCODE -ne 0) { throw 'aapt2 link 失败' }

Write-Host '[3/7] 编译 Java'
$sources = @(Get-ChildItem 'src' -Recurse -Filter *.java | ForEach-Object { $_.FullName })
$sources += (Resolve-Path "$build\gen\com\voicecall\app\R.java").Path
& $javac -encoding UTF-8 -source 8 -target 8 -Xlint:-options `
    -bootclasspath $androidJar `
    -classpath "libs\java-websocket.jar;libs\slf4j-api.jar" `
    -d "$build\classes" $sources
if ($LASTEXITCODE -ne 0) { throw 'javac 编译失败' }

Write-Host '[4/7] 生成 classes.dex'
$jarTool = Join-Path (Join-Path $javaHome 'bin') 'jar.exe'
& $jarTool cf "$build\classes.jar" -C "$build\classes" .
if ($LASTEXITCODE -ne 0) { throw '打包 class 失败' }
& "$bt\d8.bat" --release --min-api 26 `
    --lib $androidJar `
    --output "$build\dex" `
    "$build\classes.jar" `
    libs\java-websocket.jar `
    libs\slf4j-api.jar
if ($LASTEXITCODE -ne 0) { throw 'd8 失败' }

Write-Host '[5/7] 打包 APK'
& $jarTool uf "$build\base.apk" -C "$build\dex" classes.dex
if ($LASTEXITCODE -ne 0) { throw '写入 classes.dex 失败' }
& "$bt\zipalign.exe" -f -p 4 "$build\base.apk" "$build\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw 'zipalign 失败' }

Write-Host '[6/7] 签名'
$keytool = Join-Path (Join-Path $javaHome 'bin') 'keytool.exe'
if (-not (Test-Path $keytool)) { $keytool = Join-Path $javaBin 'keytool.exe' }
if (-not (Test-Path $keystore)) {
    & $keytool -genkeypair -v `
        -keystore $keystore -alias voicecall `
        -storepass voicecall -keypass voicecall `
        -keyalg RSA -keysize 2048 -validity 10000 `
        -dname 'CN=VoiceCall,OU=Mobile,O=VoiceCall,L=Beijing,ST=Beijing,C=CN'
    if ($LASTEXITCODE -ne 0) { throw 'keytool 生成密钥失败' }
}
if (Test-Path $outApk) { Remove-Item -Force $outApk }
& "$bt\apksigner.bat" sign `
    --ks $keystore --ks-key-alias voicecall `
    --ks-pass 'pass:voicecall' --key-pass 'pass:voicecall' `
    --out $outApk "$build\aligned.apk"
if ($LASTEXITCODE -ne 0) { throw 'apksigner 签名失败' }

Write-Host '[7/7] 校验签名'
& "$bt\apksigner.bat" verify --print-certs $outApk
if ($LASTEXITCODE -ne 0) { throw 'apksigner 校验失败' }

$size = [math]::Round((Get-Item $outApk).Length / 1MB, 2)
Write-Host ''
Write-Host "构建完成: $((Resolve-Path $outApk).Path) ($size MB)"
