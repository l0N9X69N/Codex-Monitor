import { PRODUCT_VERSION } from '../product/meta.js';

function vi(language) {
  return String(language ?? 'en').toLowerCase() === 'vi';
}

export function monitorHelp(language = 'en') {
  if (vi(language)) {
    return `Codex Monitor ${PRODUCT_VERSION}\n\nLỆNH HÀNG NGÀY\n  codexm              Chạy Codex với Live Monitor; mọi đối số được chuyển nguyên cho Codex\n  codexmm             Mở Session Manager\n  codexmc             Mở Config\n  codexmh             Hiển thị trợ giúp Codex Monitor\n\nBẢO TRÌ\n  codexmctl doctor    Chẩn đoán cục bộ đã được làm sạch dữ liệu nhạy cảm\n  codexmctl repair    Sửa Archive hook/service do Monitor sở hữu\n  codexmctl update    Kiểm tra bản phát hành mới; không tự cài\n  codexmctl version   Hiển thị phiên bản Codex Monitor\n  codexmctl config    In cấu hình Monitor hiệu lực\n  codexmctl config-path  In đường dẫn file cấu hình Monitor\n\nCÀI ĐẶT / GỠ CÀI ĐẶT\n  Dùng install.ps1 và uninstall.ps1 ở root GitHub. CLI không tự cài hoặc tự gỡ chính nó.\n\nNGUYÊN TẮC PASSTHROUGH\n  codexm -h, -v, -m, -c, --help, --version... đều thuộc Codex chính thức.\n  Codex Monitor không chiếm short/long flag trong entrypoint codexm.\n\nTRỢ GIÚP THEO NGỮ CẢNH\n  codexmm -h          Trợ giúp Manager\n  codexmc -h          Trợ giúp Config\n  codexmctl           Trợ giúp lệnh bảo trì\n`;
  }

  return `Codex Monitor ${PRODUCT_VERSION}\n\nDAILY COMMANDS\n  codexm              Run Codex with Live Monitor; every argument is forwarded unchanged\n  codexmm             Open Session Manager\n  codexmc             Open Config\n  codexmh             Show Codex Monitor help\n\nMAINTENANCE\n  codexmctl doctor    Run sanitized local diagnostics\n  codexmctl repair    Repair Monitor-owned Archive hook/service integration\n  codexmctl update    Check for a new release; never auto-installs\n  codexmctl version   Show Codex Monitor version\n  codexmctl config    Print effective Monitor config\n  codexmctl config-path  Print Monitor config path\n\nINSTALL / UNINSTALL\n  Use the root GitHub install.ps1 and uninstall.ps1. The CLI never installs or removes itself.\n\nPASSTHROUGH RULE\n  codexm -h, -v, -m, -c, --help, --version... belong to official Codex.\n  Codex Monitor owns no short or long flags in the codexm entrypoint.\n\nCONTEXT HELP\n  codexmm -h          Manager help\n  codexmc -h          Config help\n  codexmctl           Maintenance help\n`;
}

export function managerHelp(language = 'en') {
  return vi(language)
    ? `Codex Monitor · Manager\n\n  codexmm                 Mở Session Manager\n  codexmm --view <mode>   Mở với view operations|table|charts|auto trong lần chạy này\n  codexmm -h, --help      Hiển thị trợ giúp này\n\nTrong Manager: C mở Config, M mở Storage, V đổi view.\n`
    : `Codex Monitor · Manager\n\n  codexmm                 Open Session Manager\n  codexmm --view <mode>   Use operations|table|charts|auto for this run\n  codexmm -h, --help      Show this help\n\nInside Manager: C opens Config, M opens Storage, V cycles views.\n`;
}

export function configHelp(language = 'en') {
  return vi(language)
    ? `Codex Monitor · Config\n\n  codexmc                 Mở cấu hình dùng chung\n  codexmc --reset         Xác nhận reset tùy chọn Monitor rồi mở Config\n  codexmc -h, --help      Hiển thị trợ giúp này\n\nConfig chỉ thay đổi sau khi nhấn S để Save.\n`
    : `Codex Monitor · Config\n\n  codexmc                 Open shared Config\n  codexmc --reset         Confirm Monitor preference reset, then open Config\n  codexmc -h, --help      Show this help\n\nConfig changes are applied only after pressing S to Save.\n`;
}

export function controlHelp(language = 'en') {
  return vi(language)
    ? `Codex Monitor · Maintenance\n\n  codexmctl doctor        Chẩn đoán Monitor/Archive\n  codexmctl diagnostics   Bí danh của doctor\n  codexmctl repair        Sửa Archive integration\n  codexmctl update        Kiểm tra bản mới\n  codexmctl version       Phiên bản Monitor\n  codexmctl config        In cấu hình hiệu lực\n  codexmctl config-path   In đường dẫn cấu hình\n  codexmctl demo [state]  Demo HUD: idle|thinking|tool|approval|error\n  codexmctl help          Hiển thị trợ giúp này\n\nCài/gỡ sản phẩm dùng install.ps1 / uninstall.ps1 ở root GitHub.\n`
    : `Codex Monitor · Maintenance\n\n  codexmctl doctor        Diagnose Monitor/Archive\n  codexmctl diagnostics   Alias of doctor\n  codexmctl repair        Repair Archive integration\n  codexmctl update        Check for updates\n  codexmctl version       Show Monitor version\n  codexmctl config        Print effective config\n  codexmctl config-path   Print config path\n  codexmctl demo [state]  HUD demo: idle|thinking|tool|approval|error\n  codexmctl help          Show this help\n\nInstall/uninstall uses the root GitHub install.ps1 / uninstall.ps1.\n`;
}
