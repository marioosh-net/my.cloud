$(function(){
	var socket = io.connect();
	socket.on('progress', function (data) {
		$('#progress').show();
		$('#progress-el').css('width', data.p+'%');
		if(data.p == 100 || data.p == 0) {
			$('#progress').hide();
		}
	});

	$('#url-form').submit(function(){
		$('#save').trigger('click');
		return false;
	});
	$('#save').click(function(){
		$.ajax({
			url: '/',
			method: 'post',
			data: $("#url-form").serialize(),
			statusCode: {
				400: function() {
					alert('Problem z pobraniem ścieżki');
				}
			}			
		})
		.done(function(data) {
			location.href = location.href;
		});		
	});
});