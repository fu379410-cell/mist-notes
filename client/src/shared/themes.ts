import type { ThemeDefinition } from './types'

export const CATEGORIES = ['雾紫', '冰蓝', '青绿', '奶杏', '柔粉', '日落', '灰调', '深夜'] as const
export type GradientCategory = (typeof CATEGORIES)[number]

type RGB = readonly [number, number, number]
type PaletteRow = readonly [name: string, colors: string, legacyId?: string]

// Each row is a distinct, curated three-stop palette. IDs do not depend on names
// so that renaming a palette later cannot change an existing note's appearance.
const PALETTES: Record<GradientCategory, readonly PaletteRow[]> = {
  雾紫: [
    ['雾紫 · 冰蓝', 'F4E8F3 DFDDF6 D5EBF1', 'lilac'],
    ['暮雪鸢尾', 'EEEAF9 C5BDDF A7B8D8'],
    ['云间紫藤', 'F3E9FA DCC6EE BCBCE5'],
    ['霜落丁香', 'FAEEF5 E7C5DD D3B3D6'],
    ['月影薰衣草', 'E9E9F5 C1BDD9 9CABC8'],
    ['紫露朝霞', 'F9E2E6 E4BEDC BBA9D8'],
    ['轻雾兰花', 'F6F0FA E4D8EE CDBFD8'],
    ['白桃紫烟', 'FFE8DE EED5E6 D1C4EC'],
    ['梦中薄暮', 'ECDCF5 C9B4DF A596C0'],
    ['蝶羽浅紫', 'F1E6FC D7CBF5 C0D4F4'],
    ['银色紫罗兰', 'E7E5F1 C8C1D6 B3BAC8'],
    ['山岚锦葵', 'EDDCE9 CCBBD9 B5C6D5'],
    ['葡萄冰沙', 'F0DFF2 D3B2DF B5A8D2'],
    ['紫晶微光', 'E5DCF7 BDB2E3 91B6D7'],
    ['木槿花信', 'F7E0EE E1BDD8 C5AFD2'],
    ['雨后风铃', 'EEF2F7 D1D6EA C9BDE2'],
    ['薄荷紫霞', 'E7F2EB D2DFE7 CEC4E9'],
    ['绒雾紫棠', 'EEDBE5 D3B8CA B4A6C7'],
    ['晚樱浮云', 'F7DFE5 E5C4E1 CCC7EC'],
    ['冰川兰梦', 'E6EFF9 D0D7EE AEBDE2'],
    ['花园紫丁香', 'F5E7F0 DBC9E4 C1B5D5'],
    ['浅墨紫砚', 'E4E0E9 C4BDCD AAA6BB'],
    ['晨霭紫铃', 'F4EDF9 E0CEF2 C4C1E8'],
    ['丝绒星尘', 'DBD4EE BBAACE A49FBA'],
    ['白茶紫月', 'F5F0E5 E5DBE8 D0C7E4'],
    ['云母浅光', 'E7E8F2 D3C9E4 BCBFDA'],
    ['紫梅初绽', 'F3DCE8 DDB8D4 C29FC8'],
    ['鸢尾溪水', 'EADFF7 C8C9EB AAD7E1'],
    ['棉花紫梦', 'FFF0F4 EAD8ED D8D5F1'],
    ['烟雨藤萝', 'DCDDEB BDC1D4 A7B6C8'],
  ],
  冰蓝: [
    ['冰河初晴', 'EFF9FF D3EAF9 B5D7EF'],
    ['天际云帆', 'F3F8FC D9E9F5 BBD5E9'],
    ['海盐气泡', 'E9F8F7 C9E9F0 A8D4E8'],
    ['蓝调清晨', 'E2EFFB BED8F0 9BBFE1'],
    ['雪山倒影', 'F7FBFD DDEBF0 BFD7E3'],
    ['极地晴空', 'EAF3FC C5DDF5 A4C6EE'],
    ['湖畔玻璃', 'E4F5F3 C2E4E8 A5CDD8'],
    ['云朵苏打', 'F0F5FF D1DFFD B7CEF5'],
    ['海湾微风', 'E7F7FA BBDDEB 99C6DA'],
    ['浅海珍珠', 'F6F9F2 D4E9EB B0D3E2'],
    ['冰川蓝莓', 'EAEFFC C9D4EE ACBDE1'],
    ['月色水面', 'E8EEF3 C8D6E2 A9BDD2'],
    ['冬日瓷蓝', 'F3F7FA D7E3ED B8CADC'],
    ['碧空流羽', 'E5F7FF BDE3F8 96CDEE'],
    ['晨潮白沫', 'F4FBFA D5EEEE B2DCDD'],
    ['海雾灯塔', 'E7F0F4 C5D8E1 A6C0D2'],
    ['蓝冰柠檬', 'F6F4DE DDEAE7 B9DDEE'],
    ['雨过天青', 'EEF6F7 CFE5E8 ACD3DF'],
    ['水星信笺', 'E2EAF5 BCCCE1 A6B8D4'],
    ['晴空棉絮', 'F5F9FF DCEAFF BED8F8'],
    ['蓝风铃草', 'E9F0FE C4D7F5 A6B9E9'],
    ['水光银沙', 'EBF3F1 CFDFE4 AFC8D8'],
    ['薄冰花窗', 'EFFBFC CFEFF4 B1DCE9'],
    ['北岛长昼', 'DDEDF4 B6D4E3 95B8D1'],
    ['海蓝翡翠', 'E0F3EF B5DFDF 91C9D4'],
    ['青鸟远航', 'E9F4FC BFDFF3 93C8E8'],
    ['白露溪蓝', 'F3F8EC D9ECE8 B7DDE5'],
    ['玻璃海岸', 'DBF0F9 B4D9ED 8EBADB'],
    ['蓝调丝绸', 'E0E6F1 BDCCE2 A1B3D0'],
    ['星河冰屑', 'EEF0FA D1DAF2 B3CBE9'],
  ],
  青绿: [
    ['鼠尾草 · 薄荷', 'F0EFD8 DCE9DB D4E8E7', 'sage'],
    ['雨后苔庭', 'E8EDDF C6D6C0 A9C2AE'],
    ['薄荷晨露', 'E9FAEF C6ECD8 A8DBCE'],
    ['山茶新叶', 'F2F0D7 D9E2BA BACAAC'],
    ['青瓷小径', 'EAF2E9 CBDCD2 B0CFC9'],
    ['竹影风清', 'EEF1DC CDDDBD ABC8A6'],
    ['森林奶绿', 'E8EEDD CADBC6 A8C5B3'],
    ['玉露清泉', 'E5F4EB BEE2D3 9BCDBF'],
    ['春山白雾', 'F4F5EB DDE8D6 C2D8C3'],
    ['溪边蕨叶', 'E3EBD7 C0D4B8 9EBAA7'],
    ['茶园日光', 'F5EECF E0DFB3 BDCEA5'],
    ['薄荷牛乳', 'F5FCF3 DDF2DF C5E7D7'],
    ['石上青苔', 'E0E5D9 C1CCBA A4B7A9'],
    ['青柠苏打', 'F1F5CF DBE9AC B8D7B0'],
    ['海玻璃绿', 'E4F3ED BDE0D6 98C6C4'],
    ['白兰春雨', 'F6F3E6 E0E7D1 C6DBCC'],
    ['抹茶雪顶', 'F2EFD9 D8DDB8 B7CAA5'],
    ['玉竹薄纱', 'E8F1DF C9DEC0 AFD2BC'],
    ['水色浮萍', 'E8F3E3 C7E1CF A6D2C8'],
    ['青苹果园', 'EFF2D7 D1DFAE AEC691'],
    ['松风浅碧', 'DEEAE4 B9D1C8 95B9AF'],
    ['花叶清影', 'F2F2DD D9E4C5 BFD7B5'],
    ['绿野云杉', 'DCE8DC B4CDBA 91B5A3'],
    ['苔色羊绒', 'E9E6D6 D1D1B8 B6BFA9'],
    ['山谷清雾', 'E5EFEA C1D9D5 A5C3C2'],
    ['白桃青茶', 'F6EADB E3E6CA C6D9BA'],
    ['翡翠流光', 'DFF3E6 B4DDC6 8BC5B1'],
    ['嫩芽初醒', 'F3F4D6 DBE8BC BBD5A3'],
    ['水薄荷绿', 'E1F4EF B6E0D7 8FC9C1'],
    ['竹林暮霭', 'E0E6DA BBCAB9 9DB5AC'],
  ],
  奶杏: [
    ['奶杏 · 柔粉', 'FBEDD7 F5DFD5 EDD9E9', 'apricot'],
    ['香草云朵', 'FFFAEC F4E9CD E9D9B9'],
    ['杏仁奶霜', 'FAF1E3 EDDDC6 DCC7AF'],
    ['燕麦拿铁', 'F5EEE3 E4D7C6 CFBCA8'],
    ['奶油曲奇', 'FFF5DA F3DFB5 E5C897'],
    ['麦田晨光', 'FFF0CC EED9A3 DBC38D'],
    ['梨花白茶', 'FCF9E9 EFEAD4 E0DDC3'],
    ['蜜桃杏酪', 'FFF0DE F7DCC0 EBC4AA'],
    ['白巧慕斯', 'FBF5EC EFE4D5 E1D0BD'],
    ['浅金丝绸', 'FFF7DF F1E1B9 DECA98'],
    ['奶茶布丁', 'F5EBDC E4D0B8 CFB79E'],
    ['无花果乳', 'F6EDE1 E9D8CE D9C2CB'],
    ['杏花微雨', 'FFF3E7 F2DED0 E3C7C1'],
    ['小麦羊绒', 'F3EBDA DFD3BC CABEA5'],
    ['蜂蜜月光', 'FFF2CF F1DEA8 E2C789'],
    ['沙丘云影', 'F1E9DB DDD0BD C4B8AA'],
    ['奶黄柠檬', 'FFFADE F3ECBD E5DDA3'],
    ['卡布奇诺', 'F1E4D4 DDC5AC C4A98E'],
    ['烤杏仁香', 'F7E9D3 E6D0AD D2B58D'],
    ['白桃奶冻', 'FFF4E9 F5DFD5 E8CDC9'],
    ['珍珠香槟', 'F9F4E6 EAE2CC D8CDB5'],
    ['晨光亚麻', 'F6F0DE E5DDC3 D0C6AD'],
    ['蛋黄月亮', 'FFF3C2 F6DFA1 E9C681'],
    ['杏色书页', 'F8EDDE EAD8C5 D6BEA8'],
    ['橙花牛乳', 'FFF3DC F7DDB8 EEC79E'],
    ['奶油开心果', 'F8F4DD E7E7C7 D3DABA'],
    ['豆乳燕麦', 'F2F0E1 DFDECB C7C8B6'],
    ['淡金桂花', 'FFF3D4 F1DCAD E5C48D'],
    ['杏香晚风', 'F6E4D6 E5C8B6 D2B2A5'],
    ['象牙晨曦', 'FFFCF0 F4ECDD E7DBC7'],
  ],
  柔粉: [
    ['玫瑰牛乳', 'FFF0F2 F4D5DE E8BECB'],
    ['樱花软糖', 'FFE9EF F5CCD9 EAB2CA'],
    ['白桃气泡', 'FFF1E9 F8D9D4 EFBFC9'],
    ['蔷薇轻语', 'F9E6ED EAC6D6 D9ADCA'],
    ['山茶粉雾', 'FCE9E4 EFCDC9 DFB3B8'],
    ['粉晶微光', 'F8E9F1 E8CDE4 D4B6DA'],
    ['草莓奶昔', 'FFE9E8 F8CDCF EBAFB7'],
    ['海棠春梦', 'FAE0E3 EBBEC7 D99FAF'],
    ['胭脂云霞', 'F4DEE7 DFBACA C6A2BB'],
    ['蜜桃雪酪', 'FFF0E2 F8D8C8 EFC0B9'],
    ['花瓣信笺', 'FFF1F5 F2DBE6 E4C4D7'],
    ['玫瑰金箔', 'F9E8DD E8CABF D4AAAB'],
    ['樱雨微澜', 'F9E6EE E5CCDF D1C1DB'],
    ['粉雾香槟', 'FFF1E3 F0DCCE E3C3C8'],
    ['荔枝玫瑰', 'FFF0EE F1D6DB DEBBCB'],
    ['芍药初绽', 'F7DAE6 E7B8D0 D394B8'],
    ['晚樱月白', 'F7F0F2 E9D8E3 D7C3D4'],
    ['莓果舒芙蕾', 'F3DBE9 DCB6CF C49ABD'],
    ['粉盐海岸', 'F8EAE5 EAD7D9 D5CEDF'],
    ['杏粉绢纱', 'FCE8DF EFD0C6 E1B8BC'],
    ['玫瑰豆沙', 'EFDCD9 DCC1BF C4A5AC'],
    ['铃兰粉雪', 'FFF3F0 F0E0E5 DDD2E5'],
    ['桃枝晨光', 'FFE7DA F8C8BA E9ABB1'],
    ['柔粉云贝', 'F8E8ED E7CDD8 D0B6CD'],
    ['绣球浅梦', 'F1E3F0 DDC6E3 C6B7DD'],
    ['水蜜桃园', 'FFF0DB F7D7BD EEBBAF'],
    ['绒花粉黛', 'EEDAE1 D4B5C4 BC98B4'],
    ['贝壳浮光', 'FBEEE8 EEDAD9 DFC8D5'],
    ['莓露晨雾', 'F9E2EC E7BFD8 CEA8CF'],
    ['春日初吻', 'FFF0E8 F8D5D0 EDACBB'],
  ],
  日落: [
    ['落日余温', 'FFE9BE F8BF9A E99694'],
    ['橘海微醺', 'FFE1AD F4B080 E48B87'],
    ['暮光桃金', 'FFEDCD F7CEAA E9A4A4'],
    ['晚霞莓紫', 'F5C8B5 DEA7BB B598CE'],
    ['金色海岸', 'FFF0BB F4CE8B EAA866'],
    ['玫瑰落日', 'FAD9BC EFAFAF D493AC'],
    ['杏橘天际', 'FFEBC7 F6C89B E5AE95'],
    ['云端珊瑚', 'FFE5D2 F7BEB2 E8A1B6'],
    ['暮色蓝湾', 'F7D4B3 DDBBC6 A8B6D3'],
    ['夕照沙丘', 'F3DBB9 DCB68D C89981'],
    ['橙红花火', 'FFE0B1 F5AD86 E57E8C'],
    ['蜜橘粉霞', 'FFECC8 F9C7AC F0A5BC'],
    ['地平线紫', 'EFC2B6 CCA4BC A297C4'],
    ['暖阳入梦', 'FFF4D0 F6DBA9 EAC1A0'],
    ['霞光杏粉', 'FFE6C9 F6BDB7 DDA9CC'],
    ['余晖山影', 'F1D8BC CFBAB7 ADAABA'],
    ['琥珀轻波', 'FCE7BA E8C48E D8A26C'],
    ['云间日晕', 'FFEEC9 F2D2BB DAB8CD'],
    ['暖橙汽水', 'FFE7AD F8C27F EFA28E'],
    ['桃红晚风', 'FBD6CA ECAAAE CF92B0'],
    ['落日冰蓝', 'FAE5CA DDCED6 B6C8E4'],
    ['红柚余光', 'FFE4CE F8B9A4 EE948F'],
    ['紫金暮霭', 'F2DBB8 D9B8C8 B5A3CE'],
    ['日光杏黄', 'FFF2BD F3D393 E5B676'],
    ['落霞玫瑰茶', 'EFD3BA D8ADA4 BF929F'],
    ['珊瑚月湾', 'FFDCC5 F0B5B1 CDA8C8'],
    ['赤陶柔光', 'F1D7C2 DFB69E C99483'],
    ['霞映水面', 'F9DEC1 E4C3C9 C6B7DB'],
    ['香橙暮雪', 'FFE6C6 F7C399 E7A6A2'],
    ['暮云金边', 'F5E4C9 DFC9BF BCB9CC'],
  ],
  灰调: [
    ['白雾石英', 'F2F1F2 DEDDE2 C7CBD3'],
    ['银灰亚麻', 'EAE9E4 D2D1CC B7B9B8'],
    ['石墨浅烟', 'DADDE0 B8BEC6 99A5B0'],
    ['燕羽灰蓝', 'E4E9ED C6D0D9 A9B8C7'],
    ['暖石留白', 'F0EBE5 DBD2C9 C4B8AD'],
    ['雨云手记', 'E5E8EA CAD0D4 ACB8C2'],
    ['月光水泥', 'E4E4E3 C8C9C9 ACB0B4'],
    ['羊绒燕麦灰', 'EBE6DC D4CEBF BDB5A6'],
    ['烟紫绢纱', 'E7E1E9 CBC3D1 B0A9BF'],
    ['贝母银光', 'EFF0EB D7DDD8 BCC8C6'],
    ['北欧浅灰', 'E9EDF0 D0D8DE B8C3CB'],
    ['雾色陶土', 'E8E0D9 CFC1B6 B5A89E'],
    ['石上水纹', 'DDE5E3 BBCBC8 9CAFAA'],
    ['白桦暮雪', 'F1EDE6 DED8CC C6C0B4'],
    ['银杏灰金', 'EAE6D8 D4CEB9 BDB59B'],
    ['暮霭蓝灰', 'D9E0E7 B5C1CD 95A5B7'],
    ['珍珠灰粉', 'EDE4E4 D7C9CD C0B0BD'],
    ['远山岩灰', 'DDE1DF BDC5BF 9EADA6'],
    ['云影浮石', 'E8E9E7 CDD0CB B1B8B5'],
    ['烟雨旧纸', 'E8E2D6 CFC6B7 B5AE9F'],
    ['灰蓝月壤', 'D8DEE8 B6BFCE 97A6BB'],
    ['玫瑰岩盐', 'E8DED8 D1BEB9 B8A7A9'],
    ['银雾竹青', 'E2E8DF C3CEBF A4B5AC'],
    ['砂岩薄雾', 'E6DFD3 CDC1AF B4A792'],
    ['雪松浅灰', 'DBE3E0 B9C9C4 99B0A9'],
    ['烟波银紫', 'E1DFE8 C1BED1 A4A4BF'],
    ['静物暖灰', 'E4DFDA C9BFB7 AEA49D'],
    ['清晨钢蓝', 'D9E5EA B6CDD6 93AFBF'],
    ['浅墨梨白', 'ECEBE2 D4D5C6 B7BFAE'],
    ['冷月香灰', 'E1E3EA C0C4D1 A2AABC'],
  ],
  深夜: [
    ['午夜蓝笺', '18223C 263551 354965'],
    ['深海静谧', '152F3D 214552 30606A'],
    ['紫夜星尘', '282039 40304E 584264'],
    ['墨绿森林', '19352E 284B3E 3C6252'],
    ['黑莓丝绒', '342234 4B3044 67435A'],
    ['夜航青蓝', '162D3E 244459 345D72'],
    ['乌龙茶夜', '322F28 49463A 605B4B'],
    ['月下石墨', '252B36 3B4350 515C6B'],
    ['酒红暮色', '3D252F 573742 754B57'],
    ['星河紫蓝', '242942 363D5E 4C537A'],
    ['深松苔影', '23372C 374D3A 4F654C'],
    ['海底琉璃', '12363C 205058 326C71'],
    ['玄青月色', '202F3A 354654 4D6170'],
    ['夜玫瑰茶', '392A31 533F48 70555E'],
    ['墨色远山', '293134 404B4C 586565'],
    ['夜幕鸢尾', '2F2940 463C5C 625276'],
    ['铜金长夜', '382E24 514332 6D5B43'],
    ['寒夜极光', '1B303D 2B4A55 3D6665'],
    ['黑巧咖啡', '302623 473934 604E46'],
    ['霜蓝深空', '1E2A43 2F405D 455A78'],
    ['暗香梅影', '3B273C 553A55 71506E'],
    ['青墨竹声', '1E3434 304D49 456760'],
    ['雨夜石板', '29333F 3F4C5B 57697A'],
    ['夜雾紫灰', '302E3A 474351 605B6B'],
    ['暗潮孔雀', '18343B 274F57 3B6A71'],
    ['深秋枫影', '3F2B25 5B4035 785746'],
    ['黑曜星光', '222834 333D50 49556B'],
    ['晚安月桂', '2B3428 424D3B 59674F'],
    ['藏蓝天鹅绒', '202C43 303E61 46567F'],
    ['星夜烟紫', '292C3C 3D4359 555E76'],
  ],
}

const CATEGORY_IDS: Record<GradientCategory, string> = {
  雾紫: 'lilac', 冰蓝: 'ice', 青绿: 'sage', 奶杏: 'apricot',
  柔粉: 'rose', 日落: 'sunset', 灰调: 'stone', 深夜: 'night',
}
const ANGLES = [135, 120, 155, 165, 110, 145, 125, 150, 105, 175] as const
const DARK_INK = '#252B3C'
const LIGHT_INK = '#F6F7FF'
const NORMAL_TEXT_CONTRAST = 4.5
// A small margin covers rounded color values and compositing implementation noise.
const READABILITY_TARGET = 4.55

function normalizeHex(value: string): string | undefined {
  const hex = value?.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return `#${hex.split('').map((channel) => channel + channel).join('').toUpperCase()}`
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toUpperCase()}`
  return undefined
}

function rgb(hex: string): RGB {
  const value = normalizeHex(hex) ?? '#FFFFFF'
  return [1, 3, 5].map((start) => Number.parseInt(value.slice(start, start + 2), 16) / 255) as unknown as RGB
}

function mix(a: RGB, b: RGB, amount: number): RGB {
  return a.map((value, index) => value + (b[index] - value) * amount) as unknown as RGB
}

function luminance(color: RGB): number {
  const linear = color.map((channel) => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4)
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
}

function ratio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** WCAG relative-luminance contrast, using opaque sRGB hex colors. */
export function contrastRatio(foreground: string, background: string): number {
  return ratio(luminance(rgb(foreground)), luminance(rgb(background)))
}

function composite(color: RGB, overlay?: ThemeDefinition['overlay']): RGB {
  return overlay ? mix(color, rgb(overlay.color), Math.max(0, Math.min(1, overlay.opacity))) : color
}

/**
 * Relative luminance along an sRGB segment is convex, so its maximum is at an
 * endpoint and its minimum can be found with a bounded ternary search. Checking
 * only stops is insufficient: a saturated red-to-green segment can darken in
 * the middle. A continuous bound also catches gradients that cross the ink.
 */
function segmentLuminanceBounds(a: RGB, b: RGB): readonly [number, number] {
  let low = 0
  let high = 1
  for (let iteration = 0; iteration < 64; iteration += 1) {
    const left = low + (high - low) / 3
    const right = high - (high - low) / 3
    if (luminance(mix(a, b, left)) < luminance(mix(a, b, right))) high = right
    else low = left
  }
  const start = luminance(a)
  const end = luminance(b)
  return [Math.min(start, end, luminance(mix(a, b, (low + high) / 2))), Math.max(start, end)]
}

/** Lowest contrast anywhere on the gradient, after its uniform reading layer. */
export function minContrast(theme: ThemeDefinition): number {
  const stops = [...theme.stops].sort((a, b) => a.position - b.position)
  if (!stops.length) return 1
  const ink = luminance(rgb(theme.ink))
  const colors = stops.map((stop) => composite(rgb(stop.color), theme.overlay))
  let minimum = Infinity
  if (colors.length === 1) return ratio(ink, luminance(colors[0]))
  for (let index = 1; index < colors.length; index += 1) {
    // Coincident stops are a hard edge, not a blended segment.
    const bounds = stops[index].position === stops[index - 1].position
      ? [
          Math.min(luminance(colors[index - 1]), luminance(colors[index])),
          Math.max(luminance(colors[index - 1]), luminance(colors[index])),
        ]
      : segmentLuminanceBounds(colors[index - 1], colors[index])
    const contrast = stops[index].position === stops[index - 1].position
      ? Math.min(ratio(ink, bounds[0]), ratio(ink, bounds[1]))
      : ink >= bounds[0] && ink <= bounds[1]
        ? 1
        : Math.min(ratio(ink, bounds[0]), ratio(ink, bounds[1]))
    minimum = Math.min(minimum, contrast)
  }
  return minimum
}

/**
 * Selects readable ink, adding the smallest uniform black/white layer only when
 * neither ink color can cover the original background. Input is never mutated.
 */
export function ensureReadableTheme(theme: ThemeDefinition): ThemeDefinition {
  let stops = (theme.stops ?? []).slice(0, 4).map((stop, index) => ({
    color: normalizeHex(stop.color) ?? '#FFFFFF',
    position: Number.isFinite(stop.position)
      ? Math.max(0, Math.min(1, stop.position))
      : index / Math.max(1, Math.min(theme.stops.length, 4) - 1),
  })).sort((a, b) => a.position - b.position)
  if (stops.length === 0) stops = [{ color: '#F4E8F3', position: 0 }, { color: '#D5EBF1', position: 1 }]
  if (stops.length === 1) stops = [{ ...stops[0], position: 0 }, { ...stops[0], position: 1 }]
  const base: ThemeDefinition = {
    ...theme,
    stops,
    angle: Number.isFinite(theme.angle) ? ((theme.angle % 360) + 360) % 360 : 135,
    ink: DARK_INK,
    overlay: undefined,
  }
  const darkContrast = minContrast(base)
  const lightContrast = minContrast({ ...base, ink: LIGHT_INK })
  if (Math.max(darkContrast, lightContrast) >= READABILITY_TARGET) {
    return { ...base, ink: darkContrast >= lightContrast ? DARK_INK : LIGHT_INK }
  }
  const withLayer = (ink: string, color: string): ThemeDefinition => {
    let low = 0
    let high = 1
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const opacity = (low + high) / 2
      if (minContrast({ ...base, ink, overlay: { color, opacity } }) >= READABILITY_TARGET) high = opacity
      else low = opacity
    }
    return { ...base, ink, overlay: { color, opacity: Math.ceil(high * 10000) / 10000 } }
  }
  const dark = withLayer(DARK_INK, '#FFFFFF')
  const light = withLayer(LIGHT_INK, '#000000')
  return dark.overlay!.opacity <= light.overlay!.opacity ? dark : light
}

export const PRESET_THEMES: ThemeDefinition[] = CATEGORIES.flatMap((category) =>
  PALETTES[category].map(([name, colors, legacyId], index) => ensureReadableTheme({
    id: legacyId ?? `${CATEGORY_IDS[category]}-${String(index + 1).padStart(2, '0')}`,
    name,
    category,
    stops: colors.split(' ').map((color, stopIndex) => ({ color: `#${color}`, position: stopIndex / 2 })),
    angle: ANGLES[index % ANGLES.length],
    ink: DARK_INK,
  })),
)

const THEMES_BY_ID = new Map(PRESET_THEMES.map((theme) => [theme.id, theme]))

/** Unknown IDs safely display the original lilac theme without changing data. */
export function resolveTheme(id: string, customThemes: readonly ThemeDefinition[] = []): ThemeDefinition {
  return THEMES_BY_ID.get(id)
    ?? customThemes.find((theme) => theme.id === id)
    ?? THEMES_BY_ID.get('lilac')!
}

/** Keep the reading layer separate: this is the original color gradient only. */
export function themeBackground(theme: ThemeDefinition): string {
  const stops = [...theme.stops].sort((a, b) => a.position - b.position)
    .map((stop) => `${stop.color} ${Number((stop.position * 100).toFixed(4))}%`).join(', ')
  // Explicit interpolation keeps rendered colors aligned with minContrast().
  return `linear-gradient(${theme.angle}deg in srgb, ${stops})`
}

/**
 * Read-only QA helper: unrounded sRGB channels at a normalized gradient position,
 * including the reading layer. Channels are in 0–1, preserving numeric precision.
 */
export function sampleThemeColor(theme: ThemeDefinition, position: number): RGB {
  const stops = [...theme.stops].sort((a, b) => a.position - b.position)
  if (!stops.length) return composite(rgb('#FFFFFF'), theme.overlay)
  if (position <= stops[0].position) return composite(rgb(stops[0].color), theme.overlay)
  for (let index = 1; index < stops.length; index += 1) {
    if (position < stops[index].position) {
      const span = stops[index].position - stops[index - 1].position
      return composite(mix(rgb(stops[index - 1].color), rgb(stops[index].color),
        span === 0 ? 1 : (position - stops[index - 1].position) / span), theme.overlay)
    }
  }
  return composite(rgb(stops[stops.length - 1].color), theme.overlay)
}

export { NORMAL_TEXT_CONTRAST }
