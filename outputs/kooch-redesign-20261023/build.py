from pathlib import Path
import json, hashlib, shutil, re

ROOT=Path(__file__).resolve().parent
PLUGIN=ROOT/'plugin'/'kooch-design-refresh'
(PLUGIN/'templates').mkdir(parents=True,exist_ok=True)
(PLUGIN/'assets').mkdir(exist_ok=True)
counter=0
def uid():
 global counter
 counter+=1
 return hashlib.sha256(('kooch-refresh-'+str(counter)).encode()).hexdigest()[:7]
def widget(kind,settings):return dict(id=uid(),elType='widget',widgetType=kind,settings=settings,elements=[])
def box(children,cls='',tag='div'):
 return dict(id=uid(),elType='container',isInner=False,settings={'content_width':'full','flex_direction':'column','css_classes':cls,'html_tag':tag,'flex_gap':{'column':'0','row':'0','unit':'px'},'padding':{'unit':'px','top':'0','right':'0','bottom':'0','left':'0','isLinked':True}},elements=children)
def h(s,tag='h2',cls=''):return widget('heading',{'title':s,'header_size':tag,'_css_classes':cls})
def t(s,cls=''):return widget('text-editor',{'editor':s,'_css_classes':cls})
def a(s,url,cls=''):return widget('button',{'text':s,'link':{'url':url},'_css_classes':cls})
def image(url,alt,cls=''):
 settings={'image':{'url':url,'id':''},'image_size':'full','alt':alt,'_css_classes':cls}
 if cls=='native-logo':settings.update(link_to='custom',link={'url':'/'})
 return widget('image',settings)
def short(s):return widget('shortcode',{'shortcode':s})
def dynamic(view):return widget('kooch_dynamic',{'view':view})
def save(name,title,children):
 data={'version':'0.4','type':'page','title':title,'page_settings':{'hide_title':'yes'},'content':children}
 (PLUGIN/'templates'/(name+'.json')).write_text(json.dumps(data,ensure_ascii=False,indent=2))
 return data

arrival='{{ASSET_URL}}/arrival.webp'
logo='/wp-content/themes/kooch-child/assets/kooch-logo-transparent.png'
report='''<div class="kr-report"><div class="kr-report-top"><span>نمونهٔ خروجی کوچ</span><span class="kr-tag">پروفایل فرضی</span></div><h3>قدم بعدی، مشخص‌تر از قبل.</h3><div class="kr-report-row"><span>هدف</span><strong>کار در آلمان</strong></div><div class="kr-report-row"><span>برای بررسی بیشتر</span><strong>ویزای کار نیروی متخصص</strong></div><div class="kr-report-next"><span>قدم بعدی این نمونه</span><p>شرط پیشنهاد شغلی و وضعیت اعتبار مدرک را در منبع رسمی بررسی کن.</p></div><a class="kr-text-link" href="/sample-report/">نمونهٔ کامل را ببین <span aria-hidden="true">←</span></a></div>'''
countries=[('germany','آلمان','کار، زندگی و شروع دوباره','Germany'),('canada','کانادا','از شناخت مقصد تا زندگی روزمره','Canada')]
country_nodes=[]
for slug,label,desc,en in countries:
 country_nodes.append(box([image('https://kooch.app/wp-content/uploads/2026/10/country-'+slug+'-v1-768x512.webp','تصویرسازی مفهومی '+label,'kr-country-image'),box([t('<span lang="en" dir="ltr">'+en+'</span>','kr-country-en'),h(label,'h3'),t('<p>'+desc+'</p>'),a('راهنمای '+label+' ←','/wiki/'+slug+'/','kr-link-button')],'kr-country-copy')],'kr-country'))
hero=box([box([h('مهاجرت،<br> با یک قدم<br> <span>روشن‌تر.</span>','h1','kr-hero-title'),t('<p>مسیرت را پیدا کن، مقصدت را بشناس و برای تصمیم بعدی آماده شو. کوچ از جایی شروع می‌کند که تو ایستاده‌ای.</p>','kr-lead'),box([a('مسیرم را پیدا کنم ←','https://my.kooch.app/'),a('نمونهٔ خروجی کوچ','/sample-report/','kr-secondary')],'kr-actions'),t('<p>برای ایرانیانی که به یک شروع روشن‌تر فکر می‌کنند.</p>','kr-quiet')],'kr-hero-copy'),box([image(arrival,'تصویر مفهومی یک صبح آرام در شهر؛ ساخته‌شده با هوش مصنوعی','kr-hero-image'),t('<span>یک مقصد تازه،<br><strong>یک شروع به انتخاب تو.</strong></span>','kr-image-caption')],'kr-hero-media')],'kr-section kr-hero')
selector=box([h('الان به چه کمکی نیاز داری؟','h2','kr-choice-title'),short('[kooch_next_step]')],'kr-section kr-selector','section');selector['settings']['css_id']='next-step'
atlas=box([box([h('قبل از انتخاب،<br>زندگی در مقصد را بشناس.'),t('<p>کار و تحصیل، هزینه‌ها، خانه و زندگی روزمره؛ راهنمای ۲۴ کشور را یک‌جا مرور کن.</p>'),a('دیدن همهٔ کشورها ←','/wiki/','kr-link-button')],'kr-section-heading'),box(country_nodes,'kr-country-grid')],'kr-section kr-atlas','section')
proof=box([box([h('فقط یک جواب نه؛<br>یک قدم قابل انجام.'),t('<p>ببین چه چیزهایی را می‌دانی، کدام سؤال‌ها هنوز باز مانده‌اند و برای ادامه از کجا شروع کنی.</p>'),a('دیدن نمونهٔ کامل ←','/sample-report/','kr-link-button')],'kr-proof-copy'),t(report,'kr-report-widget')],'kr-section kr-proof','section')
consult=box([box([h('برای سؤال‌های مهمت،<br>وقت گفت‌وگو بگذار.'),t('<p>با نقشهٔ کوچ برای جلسه آماده شو؛ بعد زمان گفت‌وگوی آنلاین با مشاور را انتخاب کن.</p>'),a('آماده‌سازی و رزرو جلسه ←','/consultation/','kr-light-button')],'kr-consult-copy'),box([t('<span class="kr-consult-duration">۶۰<span>دقیقه</span></span>'),h('گفت‌وگو دربارهٔ<br>شرایط و اولویت‌های تو','h3'),t('<p>آنلاین · با انتخاب زمان جلسه</p>')],'kr-consult-aside')],'kr-section kr-consult','section')
faq=[('از کجا شروع کنم؟','اگر می‌خواهی مسیرها را بشناسی، قطب‌نمای کوچ را باز کن. برای ادامهٔ تحصیل، فرم تحصیلی را انتخاب کن؛ برای گفت‌وگو، از صفحهٔ مشاوره شروع کن.'),('هنوز مقصدی انتخاب نکرده‌ام؛ می‌توانم شروع کنم؟','بله. در قطب‌نما می‌توانی با هدفت شروع کنی و مقصدها را در قدم بعد انتخاب کنی.'),('نتیجه به من چه کمکی می‌کند؟','مسیرهای مرتبط برای مطالعه، سؤال‌های باقی‌مانده و قدم بعدی را روشن‌تر می‌بینی. بررسی مسیر با تصمیم نهایی مرجع مهاجرت متفاوت است.')]
faq_html='<div class="kr-faq">'+''.join('<details><summary>'+q+'</summary><p>'+ans+'</p></details>' for q,ans in faq)+'</div>'
home=save('home','کوچ | یک قدم روشن‌تر برای مهاجرت',[hero,selector,atlas,proof,consult,box([box([h('راهنماهایی برای تصمیم بعدی'),a('همهٔ راهنماها ←','/blog/','kr-link-button')],'kr-heading-line'),dynamic('latest')],'kr-section kr-guides','section'),box([h('چند سؤال، قبل از شروع'),t(faq_html),a('همهٔ پرسش‌ها ←','/faq/','kr-link-button')],'kr-section kr-home-faq','section')])

def intro(title,desc):return box([h(title,'h1'),t('<p>'+desc+'</p>','kr-lead')],'kr-section kr-page-intro')
def linkrow(title,desc,url,action='شروع کن ←',note=''):
 return box([box([h(title,'h2'),t('<p>'+desc+'</p>')],'kr-task-copy'),box(([t('<span>'+note+'</span>','kr-quiet')] if note else [])+[a(action,url)],'kr-task-action')],'kr-task-row')
start=save('start','از کجای مسیر شروع کنیم؟',[intro('الان کجای مسیر هستی؟','کاری را انتخاب کن که امروز یک قدم جلوتر می‌بردت.'),box([linkrow('می‌خواهم مسیرها را بشناسم','با هدفت شروع کن و راهنماهای مرتبط با مقصدهایت را پیدا کن.','https://my.kooch.app/','مسیرم را پیدا کنم ←','سؤال‌ها متناسب با پاسخ‌های تو'),linkrow('برای ادامهٔ تحصیل برنامه دارم','سابقه، علاقه‌ها و شرایط تحصیلی‌ات را یک‌جا مرتب کن.','https://my.kooch.app/?goal=study','شروع بررسی تحصیلی ←','از هدف و شرایطت شروع کن'),linkrow('می‌خواهم با مشاور صحبت کنم','نقشهٔ کوچ را کامل کن و برای جلسهٔ آنلاین آماده شو.','/consultation/','دیدن مراحل مشاوره ←','جلسهٔ آنلاین ۶۰ دقیقه‌ای'),linkrow('فعلاً می‌خواهم تحقیق کنم','راهنمای کشورها و شرایط مسیرها را بدون پر کردن فرم بخوان.','/wiki/','مرور کشورها ←')],'kr-section kr-task-list')])
save('for-me','نقطهٔ شروع من',[intro('قدم بعدی تو کدام است؟','برای شروع یک بررسی تازه یا برگشتن به جمع‌بندی‌هایت.'),box([short('[kooch_next_step]'),a('حساب و ادامهٔ بررسی ←','https://my.kooch.app/account','kr-secondary')],'kr-section kr-personal'),box([h('از مقصدت بیشتر بدان'),a('اطلس کشورها ←','/wiki/','kr-link-button'),a('مسیرهای مهاجرت ←','/visas/','kr-link-button')],'kr-section')])
save('services','کوچ چطور کمکت می‌کند؟',[intro('برای تصمیم بعدی،<br>کمک متناسب با نیازت.','از شناخت مسیر تا آماده‌شدن برای ادامهٔ تحصیل و مشاوره.'),box([linkrow('شناخت مسیرهای مهاجرت','هدف و مقصدت را انتخاب کن؛ راهنماهای مرتبط و شرایط هر مسیر را ببین.','/services/route-assessment/','شناخت این خدمت ←'),linkrow('آمادگی برای ادامهٔ تحصیل','سوابق و اولویت‌هایت را در پروفایل تحصیلی کوچ مرتب کن.','/services/academic-search/','شناخت این خدمت ←'),linkrow('مشاورهٔ مهاجرت','با شناخت بهتر از اولویت‌هایت، برای یک گفت‌وگوی متمرکز آماده شو.','/consultation/','مراحل و رزرو جلسه ←'),linkrow('راهنمای منبع‌دار','دربارهٔ کشور، مسیر و سؤال‌های مهاجرتی‌ات مطالعه کن.','/services/evidence-answers/','دیدن راهنماها ←')],'kr-section kr-task-list')])
def service(slug,title,desc,action,url,sections):
 nodes=[intro(title,desc),box([a(action,url),a('انتخاب کمک دیگر','/start/','kr-secondary')],'kr-section kr-actions kr-service-actions')]
 for head,body in sections:nodes.append(box([h(head),t(body)],'kr-section kr-prose'))
 save(slug.replace('/','--'),title,nodes)
service('services/route-assessment','از هدف تو،<br>به شناخت مسیرها.','لازم نیست از قبل نام ویزاها را بدانی. از هدفت شروع کن و مسیرهای مرتبط را برای مطالعه پیدا کن.','مسیرم را پیدا کنم ←','https://my.kooch.app/',[
 ('چه چیزی می‌بینی؟','<p>راهنمای مسیرها، شرایط و منابع هرکدام؛ همراه با سؤال‌هایی که برای ادامه باید روشن کنی. در کاتالوگ مسیرها می‌توانی کشور و نوع مسیر را هم فیلتر کنی.</p><p><a href="/visas/">مرور مستقیم مسیرها ←</a></p>'),
 ('چطور شروع کنی؟','<ol><li>هدفت را انتخاب کن.</li><li>مقصدها و جزئیات برنامه‌ات را مشخص کن.</li><li>انتخاب‌ها را مرور کن و راهنماهای مرتبط را بخوان.</li></ol>'),
 ('برای تصمیم شخصی، یک قدم بیشتر','<p>قطب‌نما ابزار شناخت مسیرهاست. برای روشن‌کردن شرایط و اولویت‌های خودت می‌توانی از <a href="/consultation/">مشاورهٔ کوچ</a> شروع کنی.</p>')])
service('services/academic-search','شروع ادامهٔ تحصیل،<br>از شناخت شرایط تو.','تحصیل قبلی، زبان، علاقه‌های پژوهشی و زمان شروع را در یک پروفایل تحصیلی مرتب کن.','شروع بررسی تحصیلی ←','https://my.kooch.app/?goal=study',[
 ('چه چیزهایی را آماده می‌کنی؟','<p>سوابق تحصیلی، مقطع و رشتهٔ موردنظر، زبان، موضوع پژوهش، بودجه و ترجیح‌های مقصد. هر بار یک سؤال مرتبط می‌بینی و می‌توانی پاسخ‌ها را مرور و اصلاح کنی.</p>'),
 ('بعد از تکمیل فرم','<p>اطلاعاتت مبنای بررسی درخواست تحصیلی می‌شود. تکمیل فرم به‌تنهایی به معنی پیدا شدن برنامه، فاند یا پذیرش نیست.</p>'),
 ('هنوز دربارهٔ مقصد مطمئن نیستی؟','<p>از <a href="/wiki/">راهنمای کشورها</a> برای شناخت زندگی و تحصیل در مقصد شروع کن. برای گفت‌وگو دربارهٔ اولویت‌هایت، <a href="/consultation/">مشاورهٔ کوچ</a> هم در دسترس است.</p>')])
service('services/evidence-answers','سؤال بهتر،<br>تصمیم روشن‌تر.','دربارهٔ کشور، مسیر و قدم‌های اقدام بخوان؛ منبع هر موضوع را هم کنار همان راهنما پیدا کن.','جستجو در راهنماها ←','/blog/',[
 ('برای شناخت کشور','<p>هزینه، خانه، کار، تحصیل و شروع زندگی را در <a href="/wiki/">اطلس کشورها</a> بخوان.</p>'),
 ('برای شناخت مسیر','<p>کشور و نوع مسیر را در <a href="/visas/">کاتالوگ مسیرهای مهاجرت</a> انتخاب کن؛ شرایط و منابع هر مسیر در صفحهٔ خودش آمده‌اند.</p>'),
 ('برای سؤال خودت','<p>اگر موضوع به شرایط شخصی‌ات وابسته است، از <a href="/consultation/">صفحهٔ مشاوره</a> برای آماده‌سازی جلسه شروع کن.</p>')])
save('pricing','خدمت و هزینه',[intro('اول کمک مناسب را انتخاب کن.','شرایط هر خدمت را پیش از شروع همان‌جا ببین.'),box([linkrow('راهنماها و قطب‌نمای کوچ','کشورها و مسیرها را مرور کن یا با انتخاب هدفت شروع کن.','https://my.kooch.app/','مسیرم را پیدا کنم ←'),linkrow('جلسهٔ مشاوره','مدت، هزینهٔ جاری و مراحل آماده‌سازی در صفحهٔ مشاوره مشخص شده‌اند.','/consultation/','دیدن شرایط جلسه ←'),linkrow('پروفایل تحصیلی','سوابق و هدف تحصیلی‌ات را برای بررسی مرتب کن.','/study-compass/','دیدن فرم تحصیلی ←')],'kr-section kr-task-list'),box([h('هزینه‌های مسیر را جدا ببین'),t('<p>هزینهٔ درخواست، آزمون، ترجمه، دانشگاه و زندگی در مقصد با خدمت کوچ یکی نیست. هزینه‌ها و شروط مالی هر مسیر را در راهنمای همان مسیر بررسی کن.</p>'),a('مرور مسیرها ←','/visas/','kr-link-button')],'kr-section kr-prose')])
save('contact','چطور کمکت کنیم؟',[intro('برای چه موضوعی کمک می‌خواهی؟','از مسیر مرتبط شروع کن تا سریع‌تر به پاسخ برسی.'),box([linkrow('نحوهٔ استفاده از کوچ','برای شروع، انتخاب ابزار و برگشت به جمع‌بندی‌ها.','/help/','راهنمای استفاده ←'),linkrow('سؤال دربارهٔ شرایط خودم','اولویت‌ها و سؤال‌هایت را پیش از یک جلسهٔ آنلاین مرتب کن.','/consultation/','صفحهٔ مشاوره ←'),linkrow('سؤال دربارهٔ زندگی در مقصد','راهنماها و گفت‌وگوهای کشور موردنظرت را پیدا کن.','/community/','دیدن کامیونیتی‌ها ←')],'kr-section kr-task-list'),box([t('<p>ارسال مستقیم پیام از این صفحه فعلاً در دسترس نیست.</p>')],'kr-section kr-prose')])
save('about','کوچ؛ همراه قدم بعدی',[intro('تصمیم بزرگ،<br>با قدم‌های روشن‌تر.','کوچ برای ایرانیانی ساخته می‌شود که می‌خواهند مهاجرت را با شناخت بیشتر از خودشان و مقصد بررسی کنند.'),box([h('از اطلاعات پراکنده تا یک نقطهٔ شروع'),t('<p>گاهی سؤال اصلی هنوز این نیست که کدام ویزا را انتخاب کنی؛ می‌خواهی بدانی چه چیزی را باید بشناسی و از کجا شروع کنی. کوچ راهنماهای کشورها، مسیرهای مهاجرت، ابزارهای شناخت شرایط و آماده‌سازی مشاوره را کنار هم می‌آورد.</p>'),a('قدم اول را پیدا کن ←','/start/')],'kr-section kr-prose'),box([h('کمک متناسب با تصمیم تو'),t('<p>از مرور راهنمای یک کشور تا مرتب‌کردن سوابق تحصیلی و آماده‌شدن برای جلسه؛ نقطهٔ شروع را خودت انتخاب می‌کنی.</p>'),a('کوچ چطور کمکت می‌کند؟ ←','/services/','kr-link-button')],'kr-section kr-prose')])
save('faq','پرسش‌های متداول',[intro('پیش از شروع،<br>جواب چند سؤال.','برای انتخاب ابزار و قدم بعدی.'),box([t(faq_html),t('<p>برای جزئیات بیشتر دربارهٔ منابع و اطلاعات حساب، <a href="/methodology/">روش بررسی</a> و <a href="/privacy/">سیاست حریم خصوصی</a> را ببین.</p>'),a('انتخاب قدم بعدی ←','/start/')],'kr-section kr-faq-page')])
save('header','سربرگ کوچ',[box([image(logo,'کوچ','native-logo'),short('[kooch_refresh_nav]'),short('[kooch_refresh_actions]')],'kooch-header kr-header','header')])
footer=box([box([image(logo,'کوچ','native-logo'),t('<p>برای ایرانیانی که به<br>یک شروع روشن‌تر فکر می‌کنند.</p>')],'kr-footer-brand'),box([h('قدم بعدی','h2'),t('<a href="/test/kooch-aghaz/">پیدا کردن مسیر</a><a href="/study-compass/">ادامهٔ تحصیل</a><a href="/consultation/">مشاورهٔ مهاجرت</a><a href="/app/">فضای من</a>')],'kr-footer-group'),box([h('کشف و مطالعه','h2'),t('<a href="/wiki/">اطلس کشورها</a><a href="/visas/">مسیرهای مهاجرت</a><a href="/blog/">راهنمای کوچ</a><a href="/community/">کامیونیتی‌ها</a>')],'kr-footer-group'),box([h('دربارهٔ کوچ','h2'),t('<a href="/about/">دربارهٔ ما</a><a href="/contact/">ارتباط با کوچ</a><a href="/faq/">پرسش‌های متداول</a><a href="/methodology/">روش بررسی</a>')],'kr-footer-group')],'kr-footer-grid')
save('footer','پاورقی کوچ',[box([footer,t('<span>کوچ · ۲۰۲۶</span><span><a href="/privacy/">حریم خصوصی</a><a href="/terms/">شرایط استفاده</a><a href="/editorial-policy/">سیاست تحریریه</a></span>','kr-footer-bottom')],'kr-footer')])
shutil.copy(ROOT/'assets'/'arrival.webp',PLUGIN/'assets'/'arrival.webp')
print('Built',len(list((PLUGIN/'templates').glob('*.json'))),'native Elementor templates')
