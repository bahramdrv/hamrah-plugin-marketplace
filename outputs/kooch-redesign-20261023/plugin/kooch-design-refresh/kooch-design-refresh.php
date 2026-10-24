<?php
/**
 * Plugin Name: Kooch Design Refresh
 * Description: طراحی یکپارچهٔ کوچ، قالب‌های بومی المنتور و مسیر شروع کوتاه‌تر، همراه با بازگشت نسخه.
 * Version: 1.0.4
 * Requires PHP: 8.1
 */
defined('ABSPATH') || exit;

function kooch_refresh_targets(){return [
 'home'=>'','start'=>'start','for-me'=>'for-me','services'=>'services',
 'services--route-assessment'=>'services/route-assessment',
 'services--academic-search'=>'services/academic-search',
 'services--evidence-answers'=>'services/evidence-answers',
 'pricing'=>'pricing','contact'=>'contact','about'=>'about','faq'=>'faq',
 'header'=>'header','footer'=>'footer',
];}
function kooch_refresh_destination($choice){return [
 'routes'=>'https://my.kooch.app/','academic'=>'https://my.kooch.app/?goal=study',
 'consultation'=>'/consultation/','specific'=>'/visas/'
][$choice]??null;}
function kooch_refresh_url($choice){
 $target=kooch_refresh_destination($choice);
 return $target===null?null:(str_starts_with($target,'/')?home_url($target):$target);
}
// Only the ordinary entry link is unified. Explicit legacy goals and the legacy form stay available.
function kooch_refresh_link_destination($href){
 $url=parse_url($href);if(!is_array($url)||isset($url['query'])||isset($url['fragment'])||isset($url['user'])||isset($url['pass']))return null;
 if(isset($url['host'])&&strtolower($url['host'])!==strtolower((string)parse_url(home_url('/'),PHP_URL_HOST)))return null;
 if(isset($url['scheme'])&&!in_array(strtolower($url['scheme']),['http','https'],true))return null;
 $path=rtrim($url['path']??'','/');
 if(in_array($path,['/test/kooch-aghaz','/start'],true))return kooch_refresh_url('routes');
 if(in_array($path,['/app','/login'],true))return 'https://my.kooch.app/account';
 return null;
}
function kooch_refresh_app_links($content){
 if(!get_option('kooch_refresh_enabled')||!class_exists('WP_HTML_Tag_Processor'))return $content;
 $html=new WP_HTML_Tag_Processor($content);
 while($html->next_tag('A')){
  $href=$html->get_attribute('href');if(!is_string($href))continue;
  $destination=kooch_refresh_link_destination($href);if($destination!==null)$html->set_attribute('href',$destination);
 }
 return $html->get_updated_html();
}
add_filter('the_content','kooch_refresh_app_links',30);
add_filter('elementor/widget/render_content','kooch_refresh_app_links',30);
add_filter('allowed_redirect_hosts',function($hosts){if(get_option('kooch_refresh_enabled'))$hosts[]='my.kooch.app';return array_values(array_unique($hosts));});
function kooch_refresh_keys(){return ['_elementor_data','_elementor_edit_mode','_elementor_page_settings','_wp_page_template'];}
function kooch_refresh_state($id){
 $post=get_post($id);$meta=[];
 foreach(kooch_refresh_keys() as $key)$meta[$key]=['exists'=>metadata_exists('post',$id,$key),'value'=>get_post_meta($id,$key,true)];
 return ['content'=>$post->post_content,'meta'=>$meta];
}
function kooch_refresh_hash($id){return hash('sha256',serialize(kooch_refresh_state($id)));}
function kooch_refresh_clear($id){
 delete_post_meta($id,'_elementor_css');clean_post_cache($id);
 if(class_exists(\Elementor\Core\Files\CSS\Post::class)){try{(new \Elementor\Core\Files\CSS\Post($id))->delete();}catch(\Throwable $e){/* CSS will be regenerated on the next display. */}}
}
function kooch_refresh_restore($posts){
 foreach($posts as $id=>$state){
  // Do not rewrite content if the failed operation never changed it.
  if(get_post($id)->post_content!==$state['content']){
   $r=wp_update_post(['ID'=>$id,'post_content'=>wp_slash($state['content'])],true);
   if(is_wp_error($r))return $r;
  }
  foreach($state['meta'] as $key=>$entry){if($entry['exists'])update_post_meta($id,$key,is_string($entry['value'])?wp_slash($entry['value']):$entry['value']);else delete_post_meta($id,$key);}
  kooch_refresh_clear($id);
 }
 return true;
}
function kooch_refresh_plain($nodes){
 $text=[];foreach($nodes as $node){$s=$node['settings']??[];
  foreach(['title','editor','text'] as $key)if(isset($s[$key]))$text[]=wp_strip_all_tags($s[$key]);
  if(!empty($node['elements']))$text[]=kooch_refresh_plain($node['elements']);
 }return implode("\n",$text);
}
function kooch_refresh_documents(){
 $documents=[];
 foreach(kooch_refresh_targets() as $name=>$path){
  if($name==='home')$id=(int)get_option('page_on_front');
  elseif(in_array($name,['header','footer'],true))$id=(int)get_option('kooch_layout_'.$name);
  else{$post=get_page_by_path($path);$id=$post?(int)$post->ID:0;}
  if(!$id||!get_post($id))return new WP_Error('missing_document','صفحه یا قالب پیدا نشد: '.$name);
  $file=__DIR__.'/templates/'.$name.'.json';$raw=file_get_contents($file);
  if($raw===false)return new WP_Error('missing_template','قالب بسته پیدا نشد: '.$name);
  $raw=str_replace('{{ASSET_URL}}',plugins_url('assets',__FILE__),$raw);
  $data=json_decode($raw,true);
  if(!is_array($data)||empty($data['content']))return new WP_Error('invalid_template','ساختار قالب معتبر نیست: '.$name);
  $documents[$id]=$data;
 }
 return $documents;
}
function kooch_refresh_apply(){
 if(!current_user_can('manage_options'))return new WP_Error('forbidden','دسترسی مدیر لازم است.');
 $documents=kooch_refresh_documents();if(is_wp_error($documents))return $documents;
 $bundle=hash('sha256',serialize($documents));$backup=get_option('kooch_refresh_backup');
 if(is_array($backup)&&($backup['status']??'')==='applied'){
  foreach($backup['applied_hashes'] as $id=>$hash)if(kooch_refresh_hash($id)!==$hash)return new WP_Error('editor_conflict','پس از بازطراحی، ویرایش تازه‌ای ثبت شده است. برای حفظ آن، عملیات متوقف شد.');
  if(($backup['bundle']??'')===$bundle){update_option('kooch_refresh_enabled',true,false);return ['status'=>'already_applied','count'=>count($documents)];}
 }
 $before=[];foreach($documents as $id=>$data)$before[$id]=kooch_refresh_state($id);
 if(!is_array($backup)||($backup['status']??'')!=='applied')$backup=['posts'=>$before,'created_at'=>gmdate('c')];
 $backup['status']='applying';update_option('kooch_refresh_backup',$backup,false);
 $touched=[];
 try{
  foreach($documents as $id=>$data){
   if(kooch_refresh_state($id)!==$before[$id])throw new \RuntimeException('سند هم‌زمان ویرایش شد؛ عملیات متوقف شد.');
   $r=wp_update_post(['ID'=>$id,'post_content'=>wp_slash(kooch_refresh_plain($data['content']))],true);
   if(is_wp_error($r))throw new \RuntimeException($r->get_error_message());
   $touched[$id]=$before[$id];
   $encoded=wp_json_encode($data['content'],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
   update_post_meta($id,'_elementor_data',wp_slash($encoded));
   update_post_meta($id,'_elementor_edit_mode','builder');
   update_post_meta($id,'_elementor_page_settings',['hide_title'=>'yes']);
   if(get_post_meta($id,'_elementor_data',true)!==$encoded)throw new \RuntimeException('ذخیرهٔ دادهٔ المنتور کامل نشد.');
   kooch_refresh_clear($id);
   $backup['applied_hashes'][$id]=kooch_refresh_hash($id);
   update_option('kooch_refresh_backup',$backup,false);
  }
 }catch(\Throwable $e){
  $restored=kooch_refresh_restore($touched);$backup['status']=is_wp_error($restored)?'restore_needed':'rolled_back';
  update_option('kooch_refresh_backup',$backup,false);
  return new WP_Error('apply_failed',$e->getMessage());
 }
 $backup['status']='applied';$backup['bundle']=$bundle;$backup['applied_at']=gmdate('c');
 update_option('kooch_refresh_backup',$backup,false);update_option('kooch_refresh_enabled',true,false);
 return ['status'=>'applied','count'=>count($documents)];
}
function kooch_refresh_rollback(){
 if(!current_user_can('manage_options'))return new WP_Error('forbidden','دسترسی مدیر لازم است.');
 $backup=get_option('kooch_refresh_backup');
 if(!is_array($backup)||($backup['status']??'')!=='applied')return new WP_Error('no_backup','نسخهٔ اعمال‌شده‌ای برای بازگشت وجود ندارد.');
 foreach($backup['applied_hashes'] as $id=>$hash)if(kooch_refresh_hash($id)!==$hash)return new WP_Error('editor_conflict','ویرایش تازهٔ یکی از صفحه‌ها شناسایی شد. برای حفظ آن، بازگشت خودکار انجام نشد.');
 $r=kooch_refresh_restore($backup['posts']);if(is_wp_error($r))return $r;
 $backup['status']='rolled_back';update_option('kooch_refresh_backup',$backup,false);update_option('kooch_refresh_enabled',false,false);return true;
}

add_shortcode('kooch_refresh_nav',function(){
 $items=[['مسیرهای مهاجرت','/visas/'],['کشورها','/wiki/'],['تحصیل','/study-compass/'],['مشاوره','/consultation/'],['راهنما','/blog/']];
 $html='<nav id="primary-nav" aria-label="فهرست اصلی">';foreach($items as [$label,$url])$html.='<a href="'.esc_url(home_url($url)).'">'.esc_html($label).'</a>';return $html.'</nav>';
});
add_shortcode('kooch_refresh_actions',function(){
 return '<div class="header-actions"><button class="menu-toggle" aria-controls="primary-nav" aria-expanded="false" aria-label="باز کردن فهرست"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button><a class="login-link" href="https://my.kooch.app/account">حساب و ادامهٔ بررسی</a><a class="button primary" href="https://my.kooch.app/">مسیرم را پیدا کنم <span aria-hidden="true">←</span></a></div>';
});
add_shortcode('kooch_next_step',function(){
 $choices=[['routes','پیدا کردن مسیر','هدف و مقصدت را انتخاب کن؛ راهنماهای مرتبط را ببین.'],['academic','ادامهٔ تحصیل','سوابق و اولویت‌هایت را برای بررسی تحصیلی مرتب کن.'],['consultation','گفت‌وگو با مشاور','برای جلسه آماده شو و زمان گفت‌وگو را انتخاب کن.']];
 $selected='routes';$service=isset($_GET['service'])?sanitize_key(wp_unslash($_GET['service'])):'';if($service==='academic')$selected='academic';
 $html='<form class="kr-next-form" action="'.esc_url(home_url('/start/')).'" method="get"><fieldset><legend class="screen-reader-text">کمک موردنیاز را انتخاب کن</legend><div class="kr-choice-options">';
 foreach($choices as [$value,$label,$desc])$html.='<label class="kr-choice"><input type="radio" name="next" value="'.esc_attr($value).'" data-description="'.esc_attr($desc).'" '.($value===$selected?'checked':'').'><span>'.esc_html($label).'</span></label>';
 $desc=$selected==='academic'?$choices[1][2]:$choices[0][2];
 return $html.'</div></fieldset><div class="kr-choice-bottom"><p class="kr-choice-description" aria-live="polite">'.esc_html($desc).'</p><button type="submit" class="button primary">ادامه بده <span aria-hidden="true">←</span></button></div></form>';
});
add_action('template_redirect',function(){
 if(!get_option('kooch_refresh_enabled')||!is_page('start')||!isset($_GET['next']))return;
 $destination=kooch_refresh_url(sanitize_key(wp_unslash($_GET['next'])));
 if($destination){wp_safe_redirect($destination,302);exit;}
});
add_filter('body_class',function($classes){if(get_option('kooch_refresh_enabled'))$classes[]='kooch-refresh';return $classes;});
add_action('wp_enqueue_scripts',function(){
 if(!get_option('kooch_refresh_enabled'))return;
 wp_enqueue_style('kooch-refresh',plugins_url('assets/refresh.css',__FILE__),[],(string)filemtime(__DIR__.'/assets/refresh.css'));
 wp_enqueue_script('kooch-refresh',plugins_url('assets/refresh.js',__FILE__),[],(string)filemtime(__DIR__.'/assets/refresh.js'),true);
},100);
// Core image widgets retain their normal Elementor controls and gain explicit loading hints.
add_filter('elementor/widget/render_content',function($content,$widget){
 if(!get_option('kooch_refresh_enabled')||$widget->get_name()!=='image'||!class_exists('WP_HTML_Tag_Processor'))return $content;
 $settings=$widget->get_settings_for_display();$classes=$settings['_css_classes']??'';
 $html=new WP_HTML_Tag_Processor($content);
 while($html->next_tag('IMG')){
  if(!empty($settings['alt']))$html->set_attribute('alt',$settings['alt']);
  if(str_contains($classes,'kr-hero-image')){$html->set_attribute('loading','eager');$html->set_attribute('fetchpriority','high');$html->set_attribute('width','1440');$html->set_attribute('height','960');}
 }
 return $html->get_updated_html();
},20,2);
add_action('admin_menu',function(){add_management_page('بازطراحی کوچ','بازطراحی کوچ','manage_options','kooch-design-refresh','kooch_refresh_admin');});
function kooch_refresh_admin(){
 if(!current_user_can('manage_options'))return;
 $backup=get_option('kooch_refresh_backup');
 echo '<div class="wrap" dir="rtl"><h1>بازطراحی کوچ</h1><p>۱۳ سند بومی المنتور و ظاهر مشترک صفحات؛ دادهٔ کشورها، ویزاها و فرم‌های موجود تغییر نمی‌کند.</p><p>وضعیت: <strong>'.esc_html($backup['status']??'آمادهٔ اعمال').'</strong></p>';
 if(isset($_GET['result']))echo '<div class="notice notice-info"><p>'.esc_html(sanitize_text_field(wp_unslash($_GET['result']))).'</p></div>';
 foreach(['apply'=>'اعمال بازطراحی با ذخیرهٔ نسخهٔ قبلی','rollback'=>'بازگشت به نسخهٔ قبلی'] as $action=>$label){echo '<form method="post" action="'.esc_url(admin_url('admin-post.php')).'">';wp_nonce_field('kooch_refresh_'.$action);echo '<input type="hidden" name="action" value="kooch_refresh_'.$action.'">';submit_button($label,$action==='apply'?'primary':'secondary');echo '</form>';}
 echo '<p>پس از اعمال، همهٔ سندها با ویرایشگر المنتور قابل ویرایش‌اند. بازگشت خودکار، ویرایش تازهٔ پس از اعمال را بازنویسی نمی‌کند.</p></div>';
}
foreach(['apply','rollback'] as $operation)add_action('admin_post_kooch_refresh_'.$operation,function()use($operation){
 if(!current_user_can('manage_options'))wp_die('دسترسی مدیر لازم است.');
 check_admin_referer('kooch_refresh_'.$operation);
 $result=$operation==='apply'?kooch_refresh_apply():kooch_refresh_rollback();
 $message=is_wp_error($result)?$result->get_error_message():($operation==='apply'?'بازطراحی اعمال شد؛ ۱۳ سند المنتور آماده‌اند.':'نسخهٔ قبلی بازگردانده شد.');
 wp_safe_redirect(add_query_arg('result',$message,admin_url('tools.php?page=kooch-design-refresh')));exit;
});
