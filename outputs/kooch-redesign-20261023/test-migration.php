<?php
define('ABSPATH', __DIR__.'/');
function add_action(...$args){} function add_filter(...$args){} function add_shortcode(...$args){}
function register_activation_hook(...$args){}
function current_user_can($cap){return $GLOBALS['can_edit']??true;}
function plugins_url($path,$file){return 'https://kooch.app/wp-content/plugins/kooch-design-refresh/'.$path;}
function home_url($path=''){return 'https://kooch.app'.$path;}
function wp_slash($s){return addslashes($s);}
function wp_unslash($s){return is_string($s)?stripslashes($s):$s;}
function wp_json_encode($s,$flags=0){return json_encode($s,$flags);}
function wp_strip_all_tags($s){return strip_tags($s);}
function wp_kses_post($s){return $s;}
function esc_url($s){return htmlspecialchars($s,ENT_QUOTES);}
function esc_html($s){return htmlspecialchars($s,ENT_QUOTES);}
function esc_attr($s){return htmlspecialchars($s,ENT_QUOTES);}
class WP_Error{public function __construct(public $code,public $message){} public function get_error_message(){return $this->message;}}
function is_wp_error($v){return $v instanceof WP_Error;}
function get_option($key,$fallback=false){return $GLOBALS['options'][$key]??$fallback;}
function update_option($key,$v,...$rest){$GLOBALS['options'][$key]=$v;return true;}
function get_page_by_path($path,$output='OBJECT',$type='page'){foreach($GLOBALS['posts'] as $p)if($p->path===$path)return $p;return null;}
function get_post($id){return $GLOBALS['posts'][$id]??null;}
function get_post_meta($id,$key,$single=true){return $GLOBALS['meta'][$id][$key]??'';}
function metadata_exists($type,$id,$key){return array_key_exists($key,$GLOBALS['meta'][$id]??[]);}
function update_post_meta($id,$key,$v){$GLOBALS['meta'][$id][$key]=wp_unslash($v);return true;}
function delete_post_meta($id,$key){unset($GLOBALS['meta'][$id][$key]);return true;}
function wp_update_post($data,$error=false){
 if(($GLOBALS['fail_post']??0)===$data['ID'])return new WP_Error('write_failed','Simulated write failure');
 $GLOBALS['posts'][$data['ID']]->post_content=wp_unslash($data['post_content']);return $data['ID'];
}
function clean_post_cache($id){}
function is_user_logged_in(){return true;}
function is_page($id){return false;}
function checkit($ok,$label){if(!$ok)throw new Exception($label);echo "PASS: $label\n";}
require __DIR__.'/plugin/kooch-design-refresh/kooch-design-refresh.php';
function fixture(){
 $GLOBALS['posts']=[];$GLOBALS['meta']=[];$GLOBALS['options']=[];$GLOBALS['fail_post']=0;$GLOBALS['can_edit']=true;
 $i=1;foreach(kooch_refresh_targets() as $name=>$target){$id=$i++;$GLOBALS['posts'][$id]=(object)['ID'=>$id,'path'=>$target,'post_content'=>'Original '.$name];$GLOBALS['meta'][$id]=['_elementor_data'=>'[{"old":"'.$name.'"}]','_elementor_edit_mode'=>'builder'];if(in_array($name,['header','footer']))$GLOBALS['options']['kooch_layout_'.$name]=$id;}
 $GLOBALS['options']['page_on_front']=1;
 $GLOBALS['posts'][999]=(object)['ID'=>999,'path'=>'wiki/germany','post_content'=>'Do not touch factual country content'];$GLOBALS['meta'][999]=['_elementor_data'=>'unchanged'];
}
checkit(kooch_refresh_destination('routes')==='https://my.kooch.app/','Migration discovery reaches the canonical app');
checkit(kooch_refresh_url('routes')==='https://my.kooch.app/','Absolute app URL is not prefixed by the WordPress origin');
checkit(kooch_refresh_url('academic')==='https://my.kooch.app/?goal=study','Academic entry uses the common interview with its stated goal');
checkit(kooch_refresh_link_destination('/test/kooch-aghaz/')==='https://my.kooch.app/','Ordinary migration entry links reach the app');
checkit(kooch_refresh_link_destination('/start/')==='https://my.kooch.app/','The primary start link reaches the same interview');
checkit(kooch_refresh_link_destination('/app/')==='https://my.kooch.app/account','My space reaches the canonical account');
checkit(kooch_refresh_link_destination('/login/')==='https://my.kooch.app/account','Ordinary login links reach the canonical account');
checkit(kooch_refresh_link_destination('/login/?action=lostpassword')===null,'Legacy account recovery is preserved');
checkit(kooch_refresh_link_destination('https://kooch.app/test/kooch-aghaz/')==='https://my.kooch.app/','Absolute same-site entry links also reach the app');
checkit(kooch_refresh_link_destination('https://evil.test/test/kooch-aghaz/')===null,'Third-party links are not rewritten');
checkit(kooch_refresh_link_destination('/test/kooch-aghaz/?goal=visit')===null,'Specific legacy journeys remain available');
checkit(kooch_refresh_destination('academic')==='https://my.kooch.app/?goal=study','Academic choice reaches the common study interview');
checkit(kooch_refresh_destination('https://evil.test')===null,'Unknown choices cannot redirect externally');
fixture();$before=serialize([$GLOBALS['posts'],$GLOBALS['meta']]);
$GLOBALS['can_edit']=false;checkit(is_wp_error(kooch_refresh_apply()),'Migration requires an administrator');
$GLOBALS['can_edit']=true;$r=kooch_refresh_apply();checkit(!is_wp_error($r),'Apply succeeds');
$home=get_page_by_path('home');
checkit($GLOBALS['meta'][999]['_elementor_data']==='unchanged','Factual country content is untouched');
checkit(count(get_option('kooch_refresh_backup')['posts'])===13,'Every changed document has an exact backup');
$applied=serialize([$GLOBALS['posts'],$GLOBALS['meta']]);kooch_refresh_apply();checkit($applied===serialize([$GLOBALS['posts'],$GLOBALS['meta']]),'Repeated apply is idempotent');
$id=array_key_first($GLOBALS['posts']);$GLOBALS['meta'][$id]['_elementor_data']='Manual editor change';
checkit(is_wp_error(kooch_refresh_rollback()),'Rollback refuses to overwrite later editor work');
$GLOBALS['meta'][$id]['_elementor_data']=json_decode(json_encode(unserialize($applied)[1][$id]['_elementor_data']),true);
checkit(!is_wp_error(kooch_refresh_rollback()),'Unchanged applied version rolls back');
checkit($before===serialize([$GLOBALS['posts'],$GLOBALS['meta']]),'Rollback restores original content and metadata exactly');
fixture();$before=serialize([$GLOBALS['posts'],$GLOBALS['meta']]);$GLOBALS['fail_post']=3;
checkit(is_wp_error(kooch_refresh_apply()),'A failed write is reported');
checkit($before===serialize([$GLOBALS['posts'],$GLOBALS['meta']]),'A failed write restores earlier mutations');
fixture();unset($GLOBALS['posts'][4]);$before=serialize([$GLOBALS['posts'],$GLOBALS['meta']]);
checkit(is_wp_error(kooch_refresh_apply()),'A missing target stops the entire migration');
checkit($before===serialize([$GLOBALS['posts'],$GLOBALS['meta']]),'Missing target causes no partial changes');
